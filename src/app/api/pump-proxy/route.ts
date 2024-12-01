import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let mintAddress = searchParams.get('mintAddress');

  if (!mintAddress) {
    return NextResponse.json(
      { error: 'Missing or invalid mintAddress' },
      { status: 400 }
    );
  }

  // Remove 'pump' suffix if it exists for initial processing
  const baseMintAddress = mintAddress.endsWith('pump') 
    ? mintAddress.slice(0, -4) 
    : mintAddress;

  console.log('Fetching data for mintAddress:', mintAddress);

  // Function to handle API call with retries and response validation
  async function fetchWithRetry(url: string, options: any, retries = 3, delay = 1000) {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type');
        
        // Check if response is HTML (error page) instead of JSON
        if (contentType?.includes('text/html')) {
          console.log(`Received HTML response from ${url}`);
          throw new Error('Endpoint unavailable');
        }

        // For 404s, return immediately
        if (response.status === 404) {
          throw new Error('Token not found');
        }

        // For 500s, wait and retry
        if (response.status === 500) {
          throw new Error('Internal server error');
        }

        if (response.ok) {
          const data = await response.json();
          
          // Validate the response data
          if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
            throw new Error('Empty or invalid response data');
          }
          
          return data;
        }
        
        const errorText = await response.text();
        lastError = new Error(`API responded with status: ${response.status} - ${errorText}`);
        
        // Log detailed error information
        console.error(`API attempt ${i + 1} failed:`, {
          url,
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: errorText.substring(0, 200), // Limit error text length
          timestamp: new Date().toISOString()
        });

        // If not a 500 error and last retry, throw immediately
        if (response.status !== 500 && i === retries - 1) {
          throw lastError;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
          
          // If it's a 404 or HTML response, don't retry
          if (error.message === 'Token not found' || error.message === 'Endpoint unavailable') {
            throw error;
          }
        } else {
          lastError = new Error('Unknown error occurred');
        }
        
        if (i === retries - 1) throw lastError;
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
    throw lastError || new Error('All retry attempts failed');
  }

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/',
  };

  // Try both versions of the mint address (with and without 'pump' suffix)
  try {
    // First try with the original mint address
    try {
      const data = await fetchWithRetry(`https://frontend-api.pump.fun/coins/${mintAddress}`, {
        headers,
        cache: 'no-store'
      });
      return NextResponse.json(data);
    } catch (error) {
      // Type guard for Error instance
      if (!(error instanceof Error)) {
        throw new Error('Unknown error occurred');
      }
      
      // If the error is not "Token not found", throw it
      if (error.message !== 'Token not found') {
        throw error;
      }
      
      // If the original address didn't work and it's different from the base address,
      // try the alternate version
      if (mintAddress !== baseMintAddress) {
        console.log('Trying base mint address:', baseMintAddress);
        const data = await fetchWithRetry(`https://frontend-api.pump.fun/coins/${baseMintAddress}`, {
          headers,
          cache: 'no-store'
        });
        return NextResponse.json(data);
      }
      
      // If we have the base address and adding 'pump' might help, try that
      if (mintAddress === baseMintAddress) {
        const pumpAddress = `${baseMintAddress}pump`;
        console.log('Trying with pump suffix:', pumpAddress);
        const data = await fetchWithRetry(`https://frontend-api.pump.fun/coins/${pumpAddress}`, {
          headers,
          cache: 'no-store'
        });
        return NextResponse.json(data);
      }
      
      // If we get here, neither version worked
      throw error;
    }
  } catch (error) {
    console.error('Error in pump-proxy:', error);
    
    // Type guard for Error instance
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { 
          error: 'Failed to fetch token data',
          details: 'Unknown error occurred',
          mintAddress,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
    
    // Handle specific error cases
    if (error.message === 'Token not found') {
      return NextResponse.json(
        { 
          error: 'Token not found', 
          mintAddress,
          triedAddresses: [mintAddress, mintAddress !== baseMintAddress ? baseMintAddress : `${baseMintAddress}pump`],
          timestamp: new Date().toISOString() 
        },
        { status: 404 }
      );
    }
    
    if (error.message === 'Endpoint unavailable') {
      return NextResponse.json(
        { 
          error: 'Service temporarily unavailable',
          details: 'API endpoint is currently unavailable',
          mintAddress,
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: 'Failed to fetch token data',
        details: error.message,
        mintAddress,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

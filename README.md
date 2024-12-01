# Pump.fun-Twitter-Bot
Automatically monitors and trades Pump.Fun tokens based on Twitter activity. The bot can be configured to automatically buy tokens when they are tweeted about, with customizable criteria such as minimum follower count for the tweet author.

## Features
- Real-time Twitter monitoring for Pump.Fun contract addresses/links
- Automatic token purchases based on configurable criteria
- Follower count filtering to target high-impact tweets
- Support for both Pump.fun and DexScreener links
- Modern web interface for monitoring and configuration
- Real-time order status tracking
- Blacklist and buylist functionality

## Setup and Configuration

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```env
NEXT_PUBLIC_HELIUS_RPC_URL=YOUR_HELIUS_RPC_LINK
NEXT_PUBLIC_TWITTER_WS_URL=YOUR_BACKEND_WS_URL
```
Replace:
- `YOUR_HELIUS_RPC_LINK` with your Helius RPC endpoint
- `YOUR_BACKEND_WS_URL` with the WebSocket backend URL for Twitter monitoring

3. Configure your trading settings in the web interface:
- Set minimum follower count for auto-buying
- Configure buy amount in SOL
- Set slippage tolerance
- Enable/disable auto-buying
- Manage blacklisted addresses
- Set token creation time filters

## Running the Application

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## Security Notes
- Never share your private keys or environment variables
- Keep your `.env` file secure and never commit it to version control
- Regularly monitor your wallet activity
- Start with small trade amounts until you're comfortable with the bot's operation

## Trading Settings
The bot can be configured through the web interface with the following options:
- Minimum follower count for auto-buying
- Buy amount in SOL per trade
- Slippage tolerance percentage
- Token age restrictions
- Blacklist for specific Twitter accounts
- Buylist for trusted accounts

## Logs and Monitoring
- All trading activity is logged in the web interface
- Real-time order status updates
- Transaction links to Solscan for verification
- Error reporting and notifications

Enjoy trading! Remember to always trade responsibly and never invest more than you can afford to lose.
from pump_twitter import buy
import threading
import requests
import logging
import json
import time
import os

# Set up logging
logging.basicConfig(level=logging.INFO, filename='twitter_search.log',
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Define base API request parameters
url = "https://api.socialdata.tools/twitter/search"
headers = {
    'Authorization': 'Bearer YOURKEYHERE',
    'Accept': 'application/json'
}

# Function to get the current Unix time minus 10 seconds
def get_since_time():
    return int(time.time()) - 6

# Function to load existing data from the JSON file or create a new one
def load_existing_data(filename):
    if os.path.exists(filename):
        with open(filename, 'r') as json_file:
            try:
                return json.load(json_file)
            except json.JSONDecodeError:
                return []
    else:
        # Create an empty file
        with open(filename, 'w') as json_file:
            json.dump([], json_file, indent=4)
        return []

# Function to get the next available ID
def get_next_id(existing_data):
    if not existing_data:
        return 1
    return max(item['id'] for item in existing_data) + 1

def filter_tweets(tweets, existing_data):
    next_id = get_next_id(existing_data)
    filtered_data = []
    for tweet in tweets:
        user = tweet.get("user", {})
        screen_name = user.get("screen_name", "")
        entities = tweet.get("entities", {})
        urls = entities.get("urls", [])

        # Filter only URLs starting with "https://pump.fun/" and ending with "pump"
        expanded_urls = [url.get("expanded_url", "") for url in urls if url.get("expanded_url", "").startswith("https://pump.fun/") and url.get("expanded_url", "").endswith("pump")]

        if expanded_urls:
            filtered_data.append({
                "id": next_id,
                "screen_name": screen_name,
                "urls": expanded_urls
            })
            next_id += 1
    return filtered_data


# Function to update the JSON file with new filtered data
def update_json_file(filename, new_data):
    existing_data = load_existing_data(filename)
    new_filtered_data = filter_tweets(new_data, existing_data)
    existing_data.extend(new_filtered_data)

    with open(filename, 'w') as json_file:
        json.dump(existing_data, json_file, indent=4)
    logging.info('Filtered data appended to %s', filename)

# Initialize the JSON file if it does not exist
output_filename = 'twitter_search_filtered_results.json'
load_existing_data(output_filename)

# Define base API request parameters for followerscheck.py
url_template = "https://api.socialdata.tools/twitter/user/{}"
headers = {
    'Authorization': 'Bearer YOURKEYHERE', ###### REPLACE WITH API KEY
    'Accept': 'application/json'
}

# Monitor the search results file
twitter_search_results_file = 'twitter_search_filtered_results.json'
profile_data_file = 'twitter_user_profiles.json'

# Create the file if it doesn't exist
def initialize_json_file(filename):
    if not os.path.exists(filename):
        with open(filename, 'w') as json_file:
            json.dump([], json_file, indent=4)

# Load existing data from the JSON file
def load_existing_data(filename):
    if os.path.exists(filename):
        with open(filename, 'r') as json_file:
            try:
                return json.load(json_file)
            except json.JSONDecodeError:
                return []
    else:
        return []

# Save new profile data to the profiles JSON file
def update_profiles_file(filename, new_data):
    existing_data = load_existing_data(filename)
    existing_screen_names = {item['screen_name'] for item in existing_data}

    # Only add new data if the screen_name is not already in the file
    new_profiles = [profile for profile in new_data if profile['screen_name'] not in existing_screen_names]

    if new_profiles:
        existing_data.extend(new_profiles)
        with open(filename, 'w') as json_file:
            json.dump(existing_data, json_file, indent=4)
        logging.info('New profiles appended to %s', filename)

# Retrieve user profile information from the API
def get_user_profile(screen_name):
    url = url_template.format(screen_name)
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error('Error retrieving profile for %s: %s', screen_name, e)
        return None

# Define a function to run each script in a separate thread
def run_twitter_search():
    # Main loop to fetch data every 10 seconds from twitter_search.py
    while True:
        since_time = get_since_time()
        params = {
            'query': f'pump.fun/ -filter:retweets since_time:{since_time}'
        }

        # Send the request
        try:
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            response_data = response.json()
            logging.info('Request successful. Response data: %s', response_data)

            # Filter the tweets and update the JSON file
            if isinstance(response_data, dict) and 'tweets' in response_data:
                update_json_file(output_filename, response_data['tweets'])
            else:
                logging.error('Unexpected response format: %s', response_data)

        except requests.exceptions.RequestException as e:
            logging.error('Request failed: %s', e)

        # Wait for 10 seconds before making the next request
        time.sleep(6)

def run_followers_check():
    # Monitor the twitter_search_filtered_results.json file for new entries from followerscheck.py
    initialize_json_file(twitter_search_results_file)
    initialize_json_file(profile_data_file)

    known_ids = {entry['id'] for entry in load_existing_data(profile_data_file)}

    while True:
        search_results = load_existing_data(twitter_search_results_file)

        new_profiles = []
        for tweet in search_results:
            if tweet['id'] not in known_ids:
                known_ids.add(tweet['id'])
                for url in tweet['urls']:
                    # Retrieve user profile details
                    profile = get_user_profile(tweet['screen_name'])
                    if profile:
                        new_profiles.append({
                            "id": tweet['id'],
                            "url": url,
                            "screen_name": profile['screen_name'],
                            "followers_count": profile['followers_count']
                        })
                        break  # Only need one profile per user

        if new_profiles:
            update_profiles_file(profile_data_file, new_profiles)

        # Wait before checking for new entries again
        time.sleep(0.01)


# Buy Token 
def run_buy_function():
    profile_data_file = 'twitter_user_profiles.json'
    previous_profiles = load_existing_data(profile_data_file)

    while True:
        current_profiles = load_existing_data(profile_data_file)

        for profile in current_profiles:
            if profile not in previous_profiles and profile['url'].startswith('https://pump.fun/') and profile['followers_count'] > 10000: #REPLACE WITH MINIMUM FOLLOWER COUNT
                mint_str = profile['url'].split('https://pump.fun/')[-1]
                buy(mint_str=mint_str, sol_in=1.001, slippage_decimal=0.90)  #REPLACE WITH YOUR DESIRED SOL BUY AMOUNT
                logging.info('Executed buy function for mint_str: %s', mint_str)

        previous_profiles = current_profiles

        # Wait before checking for new entries again
        time.sleep(0.01)




# Start sripts in separate threads
if __name__ == "__main__":
    thread1 = threading.Thread(target=run_twitter_search)
    thread2 = threading.Thread(target=run_followers_check)
    thread3 = threading.Thread(target=run_buy_function)

    thread1.start()
    thread2.start()
    thread3.start()

# Pump.fun-Twitter-Bot
Checks twitter every couple of seconds for new Tweets with Pump.Fun Contract addresses/links. Automatically buys pumpfun token based on criteria of how many followers the author of tweet has. For instance if you don't want to miss out on the next "Celebrity Coin" this program can be set to buy any token tweeted from account over 100K followers. 

Setup and Run:

Note: Must do this in proper order as below:

1. Replace PubKey, Private Key, and rpc Key in config.py with your desired wallet and rpc provider.

2. Open Terminal and run command: python pump_twitter.py install

3. Create an account at socialdata.tools. we use this to get tweets rather than paying for twitter API access. This service is free to try but would cost maybe a dollar or so a day if you are running all day. 
Generate an API key and copy it, it should look something like this "324|2O..........dbdc14" . Replace YOURKEYHERE in pummpbot.py with your new key. 

4. On line 203 replace 10000 with your desired criteria for follower count. it is currently set to buy a token if tweeted by A twitter account with 10,000 followers

5. On line 205 replace 1.001 with the amount of sol you want the bot to buy when criteria is met. it is currently set to 1.001 sol. 

6. Save changes made and run terminal command : python pumpbot.py 

Will export logs to jsonn files and it automatically filters out bots that tweet a ton of links by only allowing for a trigger once from a given twitter account!


Enjoy
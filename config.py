from solana.rpc.api import Client
from solders.keypair import Keypair #type: ignore

PUB_KEY = "" # REPLACE WALLET ADDRESS
PRIV_KEY = "" # REPLACE BASE58 STRING FORMAT
RPC = "" # Use Helius or Quicknode for better performance
client = Client(RPC)
payer_keypair = Keypair.from_base58_string(PRIV_KEY)

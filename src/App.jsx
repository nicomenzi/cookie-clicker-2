// Fetch transaction history from blockchain
const fetchTransactionHistory = async (provider, walletAddress) => {
  try {
    // Get the recent transactions from the wallet
    const filter = {
      fromBlock: Math.max(0, await provider.getBlockNumber() - 1000), // Last ~1000 blocks
      address: COOKIE_CLICKER_ADDRESS, // Filter to only cookie clicker contract
    };

    const logs = await provider.getLogs(filter);
    
    // Create contract interface to decode logs
    const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
    
    // Process the logs to find our transactions
    const onchainTxs = [];
    
    for (const log of logs) {
      try {
        // Try to parse the log
        const parsedLog = clickerInterface.parseLog(log);
        
        // Skip logs that aren't our events
        if (!parsedLog) continue;
        
        // Check if this transaction is from our wallet
        if (parsedLog.name === 'CookieClicked' && 
            parsedLog.args.user && 
            parsedLog.args.user.toLowerCase() === walletAddress.toLowerCase()) {
          
          // Add to our transactions
          onchainTxs.push({
            id: log.transactionHash,
            type: 'Click',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date().toLocaleTimeString(), // We don't have the exact time from logs
            points: 1
          });
        }
        else if (parsedLog.name === 'CookiesRedeemed' && 
                parsedLog.args.user && 
                parsedLog.args.user.toLowerCase() === walletAddress.toLowerCase()) {
          
          // Add to our transactions
          onchainTxs.push({
            id: log.transactionHash,
            type: 'Redeem',
            txHash: log.transactionHash,
            status: 'confirmed',
            timestamp: new Date().toLocaleTimeString(),
            points: -parsedLog.args.tokensRedeemed.toNumber() * clicksPerToken,
            tokens: parsedLog.args.tokensRedeemed.toNumber()
          });
        }
      } catch (error) {
        // Skip logs we can't parse
        continue;
      }
    }
    
    // Merge with our pending transactions
    // Keep all pending transactions
    const pendingTxs = transactions.filter(tx => tx.status === 'pending');
    
    // Add confirmed transactions from the chain that aren't already tracked
    const knownTxHashes = new Set(transactions.map(tx => tx.txHash));
    const newOnchainTxs = onchainTxs.filter(tx => !knownTxHashes.has(tx.txHash));
    
    // Update transaction list
    if (newOnchainTxs.length > 0) {
      setTransactions(prev => [...pendingTxs, ...newOnchainTxs, ...prev.filter(tx => 
        tx.status !== 'pending' && !newOnchainTxs.some(newTx => newTx.txHash === tx.txHash)
      )].slice(0, 20)); // Keep only the most recent 20
    }
    
  } catch (error) {
    console.error("Error fetching transaction history:", error);
  }
};// App.jsx with persistent wallet and transaction queue
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { AlertCircle } from 'lucide-react';
import './App.css';

// Contract ABIs
const COOKIE_TOKEN_ABI = [
"function balanceOf(address owner) view returns (uint256)",
"function transfer(address to, uint256 amount) returns (bool)",
"function decimals() view returns (uint8)"
];

const COOKIE_CLICKER_ABI = [
"function recordClick() external",
"function redeemCookies() external",
"function userScores(address user) view returns (uint256)",
"function clicksPerToken() view returns (uint256)"
];

// Contract addresses
const COOKIE_TOKEN_ADDRESS = "0x792da3a37415ebccfa7ec0c487bee20754b7f4bc";
const COOKIE_CLICKER_ADDRESS = "0x6fb15d7db62ecbad966aa6aa1e1f647f718f5507";

// Persistent Gas wallet implementation with true cross-browser persistence
class PersistentMonadGasWallet {
constructor(provider) {
  this.provider = provider;
  this.wallet = null;
  this.balance = ethers.BigNumber.from(0);
  this.currentNonce = null; // Track nonce for sequential transactions
}

// Create a deterministic wallet using the user's signature
async create(userAddress, signer) {
  try {
    // This specific message will be used to derive the gas wallet
    const message = `Generate my persistent gas wallet for Monad Cookie Clicker - ${userAddress}`;
    
    // Get signature from the user's wallet (this is deterministic for the same message)
    const signature = await signer.signMessage(message);
    
    // Use the signature as a seed to derive a private key
    // We hash it to get a proper length for a private key
    const privateKeyBytes = ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature)));
    
    // Create wallet from this deterministic private key
    this.wallet = new ethers.Wallet(privateKeyBytes).connect(this.provider);
    
    // Initialize the nonce
    this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
    
    return this.wallet.address;
  } catch (error) {
    console.error("Error creating deterministic wallet:", error);
    throw error;
  }
}

async getBalance() {
  if (!this.wallet) return ethers.BigNumber.from(0);
  this.balance = await this.provider.getBalance(this.wallet.address);
  return this.balance;
}

async estimateGas(tx) {
  return await this.provider.estimateGas(tx);
}

// Send transaction with managed nonce
async sendTransaction(tx) {
  if (!this.wallet) throw new Error("Wallet not initialized");
  
  const balance = await this.getBalance();
  if (balance.eq(0)) throw new Error("Gas wallet has no MON");
  
  // Make sure we have the current nonce
  if (this.currentNonce === null) {
    this.currentNonce = await this.provider.getTransactionCount(this.wallet.address);
  }
  
  // Add the nonce to the transaction
  const txWithNonce = {
    ...tx,
    nonce: this.currentNonce
  };
  
  // Increment the nonce for the next transaction
  this.currentNonce++;
  
  // Sign and send the transaction using the gas wallet
  return await this.wallet.sendTransaction(txWithNonce);
}

// Get the current address of this wallet
getAddress() {
  return this.wallet ? this.wallet.address : null;
}
}

const App = () => {
// State variables
const [mainWalletConnected, setMainWalletConnected] = useState(false);
const [mainWalletAddress, setMainWalletAddress] = useState("");
const [mainProvider, setMainProvider] = useState(null);
const [mainSigner, setMainSigner] = useState(null);

const [gasWallet, setGasWallet] = useState(null);
const [gasWalletAddress, setGasWalletAddress] = useState("");
const [gasWalletBalance, setGasWalletBalance] = useState("0");

const [score, setScore] = useState(0);
const [cookieBalance, setCookieBalance] = useState(0);
const [clicksPerToken, setClicksPerToken] = useState(10);
const [redeemAmount, setRedeemAmount] = useState(10);

const [loading, setLoading] = useState(false);
const [transactions, setTransactions] = useState([]);
const [cookies, setCookies] = useState([]);
const [fundAmount, setFundAmount] = useState("0.01");

// Transaction queue system
const [txQueue, setTxQueue] = useState([]);
const [processingTx, setProcessingTx] = useState(false);
const MAX_CONCURRENT_TX = 3;

// Connect main wallet (MetaMask or other browser wallet)
const connectMainWallet = async () => {
  try {
    setLoading(true);
    
    // Request account access
    if (window.ethereum) {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Create provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Check if we're on Monad network
      const network = await provider.getNetwork();
      if (network.chainId !== 10143) { // Monad Testnet chainId
        alert("Please switch to Monad Testnet network");
        
        // Request network switch
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x279F' }], // 10143 in hex
          });
        } catch (switchError) {
          // This error code means that the chain hasn't been added to MetaMask
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x279F', // 10143 in hex
                chainName: 'Monad Testnet',
                nativeCurrency: {
                  name: 'MON',
                  symbol: 'MON',
                  decimals: 18
                },
                rpcUrls: ['https://testnet-rpc.monad.xyz/'],
                blockExplorerUrls: ['https://testnet.monadexplorer.com/']
              }],
            });
          }
        }
      }
      
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      setMainProvider(provider);
      setMainSigner(signer);
      setMainWalletConnected(true);
      setMainWalletAddress(address);
      
      // Initialize gas wallet
      await initializeGasWallet(provider, address, signer);
      
      // Load user data is now called after gas wallet is initialized
    } else {
      alert("Please install MetaMask or another Ethereum wallet");
    }
  } catch (error) {
    console.error("Error connecting wallet:", error);
    alert("Failed to connect wallet: " + error.message);
  } finally {
    setLoading(false);
  }
};

// Check if wallet is already connected on load
useEffect(() => {
  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await provider.listAccounts();
        
        if (accounts.length > 0) {
          // User is already connected
          connectMainWallet();
        }
      } catch (error) {
        console.error("Error checking connection:", error);
      }
    }
  };
  
  checkConnection();
}, []);

// Initialize the gas wallet
const initializeGasWallet = async (provider, userAddress, signer) => {
  const wallet = new PersistentMonadGasWallet(provider);
  try {
    const address = await wallet.create(userAddress, signer);
    
    setGasWallet(wallet);
    setGasWalletAddress(address);
    
    // Update gas wallet balance
    updateGasWalletBalance(wallet);
    
    // Now that we have the gas wallet address, load user data
    await loadUserData(provider, userAddress);
  } catch (error) {
    console.error("Error initializing gas wallet:", error);
    alert("Failed to initialize gas wallet. Please try again.");
  }
};

// Update gas wallet balance
const updateGasWalletBalance = async (wallet) => {
  const balance = await wallet.getBalance();
  setGasWalletBalance(ethers.utils.formatEther(balance));
};

// Fund gas wallet
const fundGasWallet = async () => {
  if (!mainSigner || !gasWalletAddress) return;
  
  setLoading(true);
  try {
    // Send MON from main wallet to gas wallet
    const tx = await mainSigner.sendTransaction({
      to: gasWalletAddress,
      value: ethers.utils.parseEther(fundAmount)
    });
    
    await tx.wait();
    
    // Update gas wallet balance
    if (gasWallet) {
      updateGasWalletBalance(gasWallet);
    }
    
    // Add transaction to history
    setTransactions(prev => [
      { 
        id: Date.now(),
        type: "Fund", 
        txHash: tx.hash, 
        amount: fundAmount + " MON", 
        timestamp: new Date().toLocaleTimeString(),
        status: 'confirmed'
      },
      ...prev.slice(0, 19)
    ]);
    
    alert(`Successfully funded gas wallet with ${fundAmount} MON`);
  } catch (error) {
    console.error("Error funding gas wallet:", error);
    alert("Failed to fund gas wallet: " + error.message);
  } finally {
    setLoading(false);
  }
};

// Load user data (score and token balance)
const loadUserData = async (provider, mainAddress) => {
  try {
    if (!gasWalletAddress) return; // Don't proceed if gas wallet isn't initialized
    
    // Important: Always use the gas wallet address for checking scores and balances
    const walletAddress = gasWalletAddress;
    
    // Get user score
    const clickerContract = new ethers.Contract(
      COOKIE_CLICKER_ADDRESS,
      COOKIE_CLICKER_ABI,
      provider
    );
    
    // Get score for the gas wallet address (not main wallet)
    const score = await clickerContract.userScores(walletAddress);
    setScore(score.toNumber());
    
    // Get clicks per token value
    const clicksPerToken = await clickerContract.clicksPerToken();
    setClicksPerToken(clicksPerToken.toNumber());
    
    // Get $COOKIE token balance
    const tokenContract = new ethers.Contract(
      COOKIE_TOKEN_ADDRESS,
      COOKIE_TOKEN_ABI,
      provider
    );
    
    const decimals = await tokenContract.decimals();
    
    // Get token balance for the gas wallet address
    const balance = await tokenContract.balanceOf(walletAddress);
    setCookieBalance(ethers.utils.formatUnits(balance, decimals));
    
    // Fetch transaction history from the chain
    await fetchTransactionHistory(provider, walletAddress);
    
  } catch (error) {
    console.error("Error loading user data:", error);
  }
};

// Load transaction history from localStorage
useEffect(() => {
  if (mainWalletAddress) {
    const storageKey = `monad_tx_history_${mainWalletAddress.toLowerCase()}`;
    const storedTx = localStorage.getItem(storageKey);
    if (storedTx) {
      try {
        const parsedTx = JSON.parse(storedTx);
        setTransactions(parsedTx);
      } catch (error) {
        console.error("Error parsing stored transactions:", error);
      }
    }
  }
}, [mainWalletAddress]);

// Save transaction history to localStorage
useEffect(() => {
  if (mainWalletAddress && transactions.length > 0) {
    const storageKey = `monad_tx_history_${mainWalletAddress.toLowerCase()}`;
    localStorage.setItem(storageKey, JSON.stringify(transactions));
  }
}, [transactions, mainWalletAddress]);

// Periodically reload user data
useEffect(() => {
  if (mainProvider && mainWalletAddress) {
    const interval = setInterval(() => {
      loadUserData(mainProvider, mainWalletAddress);
    }, 10000); // Reload every 10 seconds
    
    return () => clearInterval(interval);
  }
}, [mainProvider, mainWalletAddress]);

// Process transaction queue with proper nonce tracking
useEffect(() => {
  const processQueue = async () => {
    // If already processing or queue is empty, do nothing
    if (processingTx || txQueue.length === 0 || !gasWallet) return;
    
    // Mark as processing to prevent concurrent calls to this function
    setProcessingTx(true);
    
    try {
      // Get the next transaction from the queue
      const nextTx = txQueue[0];
      
      // Remove it from the queue
      setTxQueue(prev => prev.slice(1));
      
      // Process based on transaction type
      if (nextTx.type === 'Click') {
        await processClickTransaction(nextTx);
      } else if (nextTx.type === 'Redeem') {
        await processRedeemTransaction(nextTx);
      }
    } catch (error) {
      console.error("Error processing transaction queue:", error);
      
      // If there was a nonce error, we might need to reset the nonce
      if (error.message.includes("nonce") || error.message.includes("replacement transaction underpriced")) {
        try {
          // Reset the nonce to the current one from the network
          if (gasWallet) {
            gasWallet.currentNonce = await mainProvider.getTransactionCount(gasWallet.getAddress());
            console.log("Reset nonce to", gasWallet.currentNonce);
          }
        } catch (nonceError) {
          console.error("Error resetting nonce:", nonceError);
        }
      }
    } finally {
      setProcessingTx(false);
    }
  };
  
  processQueue();
}, [txQueue, processingTx, gasWallet, mainProvider]);

// Add a transaction to history with pending status
const addPendingTransaction = (type, details) => {
  const txId = Date.now(); // Unique identifier
  const pendingTx = {
    id: txId,
    type,
    status: 'pending',
    timestamp: new Date().toLocaleTimeString(),
    ...details
  };
  
  setTransactions(prev => [pendingTx, ...prev.slice(0, 19)]); // Keep last 20
  return txId;
};

// Update transaction when confirmed or failed
const updateTransaction = (txId, details) => {
  setTransactions(prev => 
    prev.map(tx => 
      tx.id === txId ? { ...tx, ...details } : tx
    )
  );
};

// Process click transaction
const processClickTransaction = async (queueItem) => {
  try {
    // Create contract interface for the clicker contract
    const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
    
    // Encode the function call
    const data = clickerInterface.encodeFunctionData("recordClick");
    
    // Create transaction
    const tx = {
      to: COOKIE_CLICKER_ADDRESS,
      data: data,
      gasLimit: 200000
    };
    
    // Send transaction using gas wallet
    const response = await gasWallet.sendTransaction(tx);
    
    // Update transaction in history with hash but still pending
    updateTransaction(queueItem.id, {
      txHash: response.hash
    });
    
    // Wait for transaction to be mined
    await response.wait();
    
    // Update transaction in history as confirmed
    updateTransaction(queueItem.id, {
      status: 'confirmed'
    });
    
    // No need to reload user data on every click - performance optimization
    // We'll reload user data periodically instead
    
  } catch (error) {
    console.error("Error clicking cookie:", error);
    
    // Update transaction as failed
    updateTransaction(queueItem.id, {
      status: 'failed',
      error: error.message
    });
    
    // Revert the score update
    setScore(prev => Math.max(0, prev - 1));
  }
};

// Process redeem transaction
const processRedeemTransaction = async (queueItem) => {
  try {
    // Calculate tokens to be redeemed
    const tokensToRedeem = Math.floor(queueItem.points / clicksPerToken);
    
    // Create contract interface for the clicker contract
    const clickerInterface = new ethers.utils.Interface(COOKIE_CLICKER_ABI);
    
    // Encode the function call
    const data = clickerInterface.encodeFunctionData("redeemCookies");
    
    // Create transaction
    const tx = {
      to: COOKIE_CLICKER_ADDRESS,
      data: data,
      gasLimit: 300000
    };
    
    // Send transaction using gas wallet
    const response = await gasWallet.sendTransaction(tx);
    
    // Update transaction in history with hash but still pending
    updateTransaction(queueItem.id, {
      txHash: response.hash
    });
    
    // Wait for transaction to be mined
    await response.wait();
    
    // Update transaction in history as confirmed
    updateTransaction(queueItem.id, {
      status: 'confirmed'
    });
    
    // Reload user data after redeeming
    await loadUserData(mainProvider, mainWalletAddress);
    
  } catch (error) {
    console.error("Error redeeming tokens:", error);
    
    // Update transaction as failed
    updateTransaction(queueItem.id, {
      status: 'failed',
      error: error.message
    });
    
    // Revert the score update
    setScore(prev => prev + queueItem.points);
  }
};

// Handle cookie click
const handleClick = async (e) => {
  if (!mainWalletConnected) {
    alert("Please connect your wallet first!");
    return;
  }
  
  if (!gasWallet || gasWalletBalance === "0") {
    alert("Please fund your gas wallet with MON first!");
    return;
  }
  
  // Create animation cookie
  const cookie = {
    id: Date.now(),
    x: e.clientX,
    y: e.clientY,
  };
  setCookies(prev => [...prev, cookie]);
  
  // Add a pending transaction to history
  const txId = addPendingTransaction('Click', { points: 1 });
  
  // Add to queue
  setTxQueue(prev => [...prev, { type: 'Click', id: txId }]);
  
  // Update score immediately for better UX
  setScore(prev => prev + 1);
};

// Handle redeem tokens
const handleRedeem = async () => {
  if (score < redeemAmount) {
    alert(`Not enough points! You need ${redeemAmount} points to redeem.`);
    return;
  }
  
  if (!gasWallet || gasWalletBalance === "0") {
    alert("Please fund your gas wallet with MON first!");
    return;
  }
  
  // Calculate points being redeemed
  const pointsToRedeem = Math.min(score, Math.floor(redeemAmount / clicksPerToken) * clicksPerToken);
  const tokensToReceive = Math.floor(pointsToRedeem / clicksPerToken);
  
  // Add a pending transaction to history
  const txId = addPendingTransaction('Redeem', { 
    points: -pointsToRedeem, 
    tokens: tokensToReceive 
  });
  
  // Add to queue
  setTxQueue(prev => [...prev, { 
    type: 'Redeem', 
    id: txId, 
    points: pointsToRedeem 
  }]);
  
  // Update score immediately for better UX
  setScore(prev => prev - pointsToRedeem);
};

// Remove cookies after animation
useEffect(() => {
  const timer = setTimeout(() => {
    if (cookies.length > 0) {
      setCookies(prev => prev.slice(1));
    }
  }, 1000);
  return () => clearTimeout(timer);
}, [cookies]);

return (
  <div className="flex flex-col items-center min-h-screen bg-amber-50 p-4">
    <div className="fixed top-4 right-4 flex flex-col items-end">
      {mainWalletConnected ? (
        <div className="bg-green-100 border border-green-300 rounded p-2 mb-2 text-xs text-green-800">
          Connected: {mainWalletAddress.slice(0, 6)}...{mainWalletAddress.slice(-4)}
        </div>
      ) : (
        <button 
          onClick={connectMainWallet} 
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded">
          Connect Wallet
        </button>
      )}
    </div>

    <h1 className="text-4xl font-bold text-amber-800 mt-8">Blockchain Cookie Clicker</h1>
    <p className="text-amber-600 mb-2">Each click is verified on Monad blockchain</p>
    
    {mainWalletConnected && (
      <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-4">
        <h2 className="font-bold text-lg mb-2">Persistent Gas Wallet</h2>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm">
            <div>Address: {gasWalletAddress.slice(0, 6)}...{gasWalletAddress.slice(-4)}</div>
            <div>Balance: {gasWalletBalance} MON</div>
          </div>
          <div className="flex items-center">
            <input 
              type="text" 
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 w-20 text-center mr-2"
            />
            <button 
              onClick={fundGasWallet}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-3 py-1 rounded text-sm"
            >
              Fund
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          This wallet is automatically created and persists between sessions. Fund it with MON to automate transactions.
        </div>
      </div>
    )}
    
    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mb-6">
      <div className="text-center mb-6">
        <div className="text-2xl font-bold text-amber-800">Score: {score} points</div>
        <div className="text-sm text-gray-500">$COOKIE Balance: {cookieBalance}</div>
        <div className="text-xs text-gray-400">
          You need {clicksPerToken} clicks for 1 $COOKIE token
        </div>
      </div>
      
      <div className="relative w-full h-64 bg-amber-100 rounded-lg flex items-center justify-center mb-6">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        <button 
          onClick={handleClick}
          disabled={!mainWalletConnected || gasWalletBalance === "0"}
          className="transition-transform active:scale-95 disabled:opacity-50"
        >
          <div className="w-32 h-32 rounded-full bg-amber-300 border-4 border-amber-600 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-24 h-24 rounded-full bg-amber-400 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-3xl">
                🍪
              </div>
            </div>
          </div>
        </button>
        
        {cookies.map(cookie => (
          <div 
            key={cookie.id}
            className="absolute text-3xl animate-bounce opacity-70"
            style={{
              left: cookie.x - 16,
              top: cookie.y - 16,
              animation: 'float 1s forwards'
            }}
          >
            🍪
          </div>
        ))}
      </div>
      
      <div className="flex items-center space-x-2 mb-4">
        <input 
          type="number" 
          min="1"
          value={redeemAmount}
          onChange={(e) => setRedeemAmount(parseInt(e.target.value) || 1)}
          className="border border-gray-300 rounded px-2 py-1 w-20 text-center"
        />
        <button 
          onClick={handleRedeem}
          disabled={!mainWalletConnected || score < redeemAmount || gasWalletBalance === "0"}
          className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded flex-grow"
        >
          Redeem for $COOKIE
        </button>
      </div>
      
      {(!mainWalletConnected || gasWalletBalance === "0") && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
          <AlertCircle size={16} />
          <span>
            {!mainWalletConnected 
              ? "Connect wallet to start playing" 
              : "Fund gas wallet with MON to enable clicking"}
          </span>
        </div>
      )}
    </div>
    
    <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mb-6">
      <h2 className="font-bold text-lg mb-2">Recent Transactions</h2>
      {transactions.length === 0 ? (
        <div className="text-gray-500 text-sm">No transactions yet</div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx, i) => (
            <div key={tx.id || i} className={`border-b pb-2 text-sm ${
              tx.status === 'pending' ? 'border-yellow-100 bg-yellow-50' :
              tx.status === 'confirmed' ? 'border-green-100 bg-green-50' :
              tx.status === 'failed' ? 'border-red-100 bg-red-50' :
              'border-gray-100'
            } p-2 rounded`}>
              <div className="flex justify-between">
                <span className={
                  tx.type === "Click" 
                    ? "text-green-600 flex items-center" 
                    : tx.type === "Redeem" 
                      ? "text-blue-600 flex items-center" 
                      : "text-purple-600 flex items-center"
                }>
                  {tx.type} 
                  {tx.status === 'pending' && 
                    <span className="inline-block w-4 h-4 ml-2 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin"></span>
                  }
                  {tx.status === 'confirmed' && 
                    <span className="inline-block w-4 h-4 ml-2 text-green-500">✓</span>
                  }
                  {tx.status === 'failed' && 
                    <span className="inline-block w-4 h-4 ml-2 text-red-500">✗</span>
                  }
                </span>
                <span className="text-gray-500 text-xs">{tx.timestamp}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={`
                  ${tx.status === 'pending' ? 'text-yellow-600' : 
                    tx.status === 'confirmed' ? 'text-green-600' : 
                    tx.status === 'failed' ? 'text-red-600' : 'text-gray-500'}
                `}>
                  {tx.txHash 
                    ? `TX: ${tx.txHash.slice(0, 6)}...${tx.txHash.slice(-4)}` 
                    : tx.status === 'pending' 
                      ? 'Pending...' 
                      : tx.status === 'failed' 
                        ? 'Failed' 
                        : 'Processing...'}
                </span>
                <span>
                  {tx.type === "Click" ? (
                    <span className="text-green-600">+{tx.points} points</span>
                  ) : tx.type === "Redeem" ? (
                    <span>
                      <span className="text-red-600">{tx.points} points</span>
                      {" → "}
                      <span className="text-blue-600">+{tx.tokens} $COOKIE</span>
                    </span>
                  ) : (
                    <span className="text-purple-600">+{tx.amount}</span>
                  )}
                </span>
              </div>
              {tx.status === 'failed' && tx.error && (
                <div className="text-red-500 text-xs mt-1">Error: {tx.error.substring(0, 50)}{tx.error.length > 50 ? '...' : ''}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    
    <div className="text-xs text-gray-500 mt-4 text-center">
      <p>Running on Monad EVM Blockchain</p>
      <p>$COOKIE Token Contract: {COOKIE_TOKEN_ADDRESS}</p>
      <p>Cookie Clicker Contract: {COOKIE_CLICKER_ADDRESS}</p>
    </div>
  </div>
);
};

export default App;
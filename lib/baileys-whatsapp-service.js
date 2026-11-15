'use strict';

const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const pino = require('pino');

let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let Browsers;
let fetchLatestBaileysVersion;

try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default || baileys.makeWASocket || baileys;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  Browsers = baileys.Browsers;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
} catch (err) {
  console.warn('[Baileys] Warning: Failed to load @whiskeysockets/baileys:', err.message);
}

class BaileysWhatsappService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
    this.qrCode = null;
    this.qrCodeDataUrl = null;
    this.connectedNumber = null;
    this.connectedName = null;
    this.lastConnectedAt = null;
    this.lastError = null;
    this.authDir = path.join(__dirname, '../baileys_auth');
    this.isConnecting = false;
    this.reconnectTimer = null;
  }

  ensureAuthDir() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async init() {
    if (!makeWASocket || !useMultiFileAuthState) {
      console.warn('[Baileys] Cannot initialize: @whiskeysockets/baileys not available.');
      return;
    }

    this.ensureAuthDir();
    const credsPath = path.join(this.authDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      console.log('[Baileys] Existing credentials found. Auto-connecting WhatsApp session...');
      try {
        await this.connect({ force: true });
      } catch (err) {
        console.error('[Baileys] Auto-connect on init failed:', err.message);
      }
    }
  }

  async connect({ force = false, fresh = false } = {}) {
    if (!makeWASocket || !useMultiFileAuthState) {
      throw new Error('Baileys library is not available.');
    }

    // If already connected and not forcing reconnect, return current status
    if (this.sock && this.status === 'connected' && !force && !fresh) {
      return this.getStatus();
    }

    if (fresh) {
      this.clearAuthFiles();
    }

    this.ensureAuthDir();

    // Prevent concurrent connect executions
    if (this.isConnecting && !force) {
      return this.getStatus();
    }
    this.isConnecting = true;
    this.status = 'connecting';
    this.lastError = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      // 1. Get latest WhatsApp Web version to avoid protocol handshake mismatch
      let waVersion = [2, 3000, 1043857760];
      if (typeof fetchLatestBaileysVersion === 'function') {
        try {
          const vInfo = await fetchLatestBaileysVersion();
          if (vInfo && vInfo.version) waVersion = vInfo.version;
        } catch (_) {}
      }

      // 2. Load auth state from disk
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      // Clean up previous socket listeners if existing
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.end(undefined);
        } catch (_) {}
        this.sock = null;
      }

      const logger = pino({ level: 'silent' });

      // 3. Create WhatsApp Web socket
      // Critical: Browsers.ubuntu('Chrome'), syncFullHistory: false, shouldSyncHistoryMessage: () => false
      const sock = makeWASocket({
        version: waVersion,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
        // DO NOT sync full history or background past messages
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async () => undefined,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
      });

      this.sock = sock;

      // 4. Save credentials whenever updated during QR scan pairing handshake
      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (saveErr) {
          console.error('[Baileys] Error saving credentials:', saveErr.message);
        }
      });

      // 5. Connection lifecycle handling
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR Code generated
        if (qr) {
          this.qrCode = qr;
          try {
            this.qrCodeDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
          } catch (qrErr) {
            console.error('[Baileys] QR DataURL conversion error:', qrErr.message);
          }
          this.status = 'qr_ready';
          console.log('[Baileys] QR code ready for scanning.');
        }

        // Connecting
        if (connection === 'connecting') {
          if (this.status !== 'qr_ready') {
            this.status = 'connecting';
          }
        }

        // Successfully Connected
        if (connection === 'open') {
          this.status = 'connected';
          this.qrCode = null;
          this.qrCodeDataUrl = null;
          this.lastError = null;
          this.lastConnectedAt = new Date().toISOString();

          const rawId = sock.user?.id || '';
          this.connectedNumber = rawId ? rawId.split(':')[0].replace(/@.*/, '') : '';
          this.connectedName = sock.user?.name || sock.user?.notify || '';
          console.log(`[Baileys] WhatsApp connected successfully as: ${this.connectedNumber} (${this.connectedName || 'No Name'})`);
        }

        // Connection Closed
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut;

          console.log(`[Baileys] Connection closed. StatusCode: ${statusCode}, isLoggedOut: ${isLoggedOut}`);

          if (isLoggedOut) {
            this.status = 'disconnected';
            this.connectedNumber = null;
            this.connectedName = null;
            this.qrCode = null;
            this.qrCodeDataUrl = null;
            this.lastError = 'Logged out by user or server.';
            this.clearAuthFiles();
          } else {
            // When user scans the QR code, WhatsApp sends restartRequired (code 515)
            // to finalize noise authentication. Auto-reconnecting immediately completes the pairing!
            const isRestart = statusCode === DisconnectReason?.restartRequired || statusCode === 515;
            const delay = isRestart ? 300 : 2500;
            this.status = 'connecting';
            console.log(`[Baileys] Auto-reconnecting session in ${delay}ms (reason: ${statusCode})...`);

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.connect({ force: true }).catch((rErr) => {
                console.error('[Baileys] Reconnect error:', rErr.message);
              });
            }, delay);
          }
        }
      });

      // Brief wait to allow initial QR event or open status to trigger
      await new Promise(r => setTimeout(r, 1200));

    } catch (err) {
      console.error('[Baileys] Connect error:', err.message);
      this.status = 'disconnected';
      this.lastError = err.message;
    } finally {
      this.isConnecting = false;
    }

    return this.getStatus();
  }

  async logout() {
    this.status = 'disconnected';
    this.connectedNumber = null;
    this.connectedName = null;
    this.qrCode = null;
    this.qrCodeDataUrl = null;
    this.lastError = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (_) {}
      try {
        this.sock.end(undefined);
      } catch (_) {}
      this.sock = null;
    }

    this.clearAuthFiles();
    console.log('[Baileys] WhatsApp logged out and session cleared.');
    return this.getStatus();
  }

  clearAuthFiles() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
      }
    } catch (err) {
      console.error('[Baileys] Error clearing auth files:', err.message);
    }
  }

  getStatus() {
    return {
      status: this.status, // 'connected' | 'qr_ready' | 'connecting' | 'disconnected'
      isConnected: this.status === 'connected',
      connectedNumber: this.connectedNumber,
      connectedName: this.connectedName,
      connectedAt: this.lastConnectedAt,
      qrCodeDataUrl: this.status === 'qr_ready' ? this.qrCodeDataUrl : null,
      lastError: this.lastError,
    };
  }

  async sendMessage(toNumber, message) {
    const rawNumber = String(toNumber || '').replace(/\D/g, '');
    if (!rawNumber || rawNumber.length < 10) {
      return { sent: false, error: 'Invalid recipient mobile number. Must have at least 10 digits.' };
    }

    let cleanNumber = rawNumber;
    if (cleanNumber.length === 10) {
      cleanNumber = `91${cleanNumber}`;
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
      cleanNumber = `91${cleanNumber.slice(1)}`;
    }

    if (!this.sock || this.status !== 'connected') {
      return {
        sent: false,
        error: 'WhatsApp is not connected. Please scan the QR code in Admin Service Settings to link your WhatsApp account.',
        status: this.status,
      };
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;
    try {
      const result = await this.sock.sendMessage(jid, { text: String(message || '') });
      return {
        sent: true,
        messageId: result?.key?.id,
        timestamp: result?.messageTimestamp,
        toNumber: cleanNumber,
        status: 'sent',
      };
    } catch (err) {
      console.error(`[Baileys] Failed to send message to ${cleanNumber}:`, err.message);
      return {
        sent: false,
        error: `WhatsApp Send Error: ${err.message}`,
      };
    }
  }
}

const instance = new BaileysWhatsappService();
module.exports = instance;

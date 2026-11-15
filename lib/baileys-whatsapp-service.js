'use strict';

const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const pino = require('pino');

let createSupabaseDbPool;
try {
  ({ createSupabaseDbPool } = require('./supabase'));
} catch (_) {}

let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let Browsers;
let fetchLatestBaileysVersion;
let jidNormalizedUser;

try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default || baileys.makeWASocket || baileys;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  Browsers = baileys.Browsers;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  jidNormalizedUser = baileys.jidNormalizedUser;
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
    this.profilePicUrl = null;
    this.lastConnectedAt = null;
    this.lastError = null;
    this.authDir = path.join(__dirname, '../baileys_auth');
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.db = null;
    this._syncDebounceTimer = null;
  }

  setDb(db) {
    this.db = db;
  }

  getDb() {
    if (this.db) return this.db;
    if (createSupabaseDbPool) {
      try {
        this.db = createSupabaseDbPool();
      } catch (err) {
        console.warn('[WhatsApp] DB pool initialization warning:', err.message);
      }
    }
    return this.db;
  }

  async restoreSessionFromDb() {
    const db = this.getDb();
    if (!db) return false;
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_session_store (
          file_name VARCHAR(255) PRIMARY KEY,
          file_data TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        ALTER TABLE whatsapp_session_store ENABLE ROW LEVEL SECURITY;
      `).catch(() => {});

      const res = await db.query('SELECT file_name, file_data FROM whatsapp_session_store').catch(() => null);
      if (res && res.rowCount > 0) {
        this.ensureAuthDir();
        for (const row of res.rows) {
          try {
            fs.writeFileSync(path.join(this.authDir, row.file_name), row.file_data, 'utf8');
          } catch (_) {}
        }
        console.log(`[WhatsApp] Restored ${res.rowCount} auth session files from database.`);
        return true;
      }
    } catch (err) {
      console.warn('[WhatsApp] Error restoring session files from DB:', err.message);
    }
    return false;
  }

  async syncSessionToDb() {
    const db = this.getDb();
    if (!db) return;
    try {
      if (!fs.existsSync(this.authDir)) return;
      const files = fs.readdirSync(this.authDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      if (jsonFiles.length === 0) return;

      await db.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_session_store (
          file_name VARCHAR(255) PRIMARY KEY,
          file_data TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `).catch(() => {});

      await Promise.all(
        jsonFiles.map(async (f) => {
          const fullPath = path.join(this.authDir, f);
          try {
            const fileData = fs.readFileSync(fullPath, 'utf8');
            await db.query(
              `INSERT INTO whatsapp_session_store (file_name, file_data, updated_at)
               VALUES ($1, $2, now())
               ON CONFLICT (file_name) DO UPDATE SET file_data = EXCLUDED.file_data, updated_at = now()`,
              [f, fileData]
            );
          } catch (_) {}
        })
      );
      console.log(`[WhatsApp] Synced ${jsonFiles.length} auth session files to database.`);
    } catch (err) {
      console.warn('[WhatsApp] Session sync to DB warning:', err.message);
    }
  }

  scheduleSyncToDb(delayMs = 800) {
    if (this._syncDebounceTimer) clearTimeout(this._syncDebounceTimer);
    this._syncDebounceTimer = setTimeout(() => {
      this._syncDebounceTimer = null;
      void this.syncSessionToDb();
    }, delayMs);
  }

  async clearDbSession() {
    const db = this.getDb();
    if (!db) return;
    try {
      await db.query('DELETE FROM whatsapp_session_store').catch(() => {});
      console.log('[WhatsApp] Cleared auth session store from database.');
    } catch (err) {
      console.warn('[WhatsApp] Error clearing session from DB:', err.message);
    }
  }

  ensureAuthDir() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async init(db) {
    if (db) this.setDb(db);
    if (!makeWASocket || !useMultiFileAuthState) {
      console.warn('[Baileys] Cannot initialize: @whiskeysockets/baileys not available.');
      return;
    }

    // 1. Restore auth state files from PostgreSQL (ensures session survives container restarts/deployments)
    await this.restoreSessionFromDb();

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
      await this.clearDbSession();
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
          void this.syncSessionToDb();
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

          // Fetch WhatsApp Profile Picture (DP) asynchronously
          void this.fetchProfilePicture();

          // Sync full credentials snapshot to database immediately
          await this.syncSessionToDb();
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
            this.profilePicUrl = null;
            this.qrCode = null;
            this.qrCodeDataUrl = null;
            this.lastError = 'Logged out by user or server.';
            this.clearAuthFiles();
            await this.clearDbSession();
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

      // Active wait: poll until QR code or connection is ready (up to 7.5 seconds)
      // This ensures that when connect() finishes, the QR code is ALREADY generated and returned in the HTTP response!
      const startWait = Date.now();
      const maxWait = 7500;
      while (Date.now() - startWait < maxWait) {
        if ((this.status === 'qr_ready' && this.qrCodeDataUrl) || this.status === 'connected') {
          break;
        }
        await new Promise(r => setTimeout(r, 200));
      }

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
    this.profilePicUrl = null;
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
    await this.clearDbSession();
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

  async fetchProfilePicture() {
    if (!this.sock || this.status !== 'connected') {
      return null;
    }
    if (this._isFetchingPic) {
      return this.profilePicUrl;
    }
    this._isFetchingPic = true;
    try {
      let rawId = this.sock.user?.id || (this.connectedNumber ? `${this.connectedNumber}@s.whatsapp.net` : null);
      if (!rawId) return null;
      const userJid = typeof jidNormalizedUser === 'function'
        ? jidNormalizedUser(rawId)
        : (rawId.split(':')[0] + '@s.whatsapp.net');

      if (typeof this.sock.profilePictureUrl === 'function') {
        let dp = await this.sock.profilePictureUrl(userJid, 'image', 3000).catch(() => null);
        if (!dp) {
          dp = await this.sock.profilePictureUrl(userJid, 'preview', 2000).catch(() => null);
        }
        if (dp) {
          this.profilePicUrl = dp;
          console.log('[Baileys] WhatsApp Profile Picture fetched successfully.');
          return dp;
        }
      }
    } catch (err) {
      console.warn('[Baileys] Could not fetch profile picture:', err.message);
    } finally {
      this._isFetchingPic = false;
    }
    return null;
  }

  getStatus() {
    return {
      status: this.status, // 'connected' | 'qr_ready' | 'connecting' | 'disconnected'
      isConnected: this.status === 'connected',
      connectedNumber: this.connectedNumber,
      connectedName: this.connectedName,
      profilePicUrl: this.profilePicUrl,
      connectedAt: this.lastConnectedAt,
      // If not connected and a QR code data url exists, keep returning it so UI never blanks out
      qrCodeDataUrl: this.status !== 'connected' ? (this.qrCodeDataUrl || null) : null,
      lastError: this.lastError,
    };
  }

  async sendMessage(toNumber, message) {
    const digits = String(toNumber || '').replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      return { sent: false, error: 'Invalid recipient mobile number. Must have at least 10 digits.' };
    }

    // Always normalize to 12-digit Indian format (91XXXXXXXXXX)
    const mobile10 = digits.slice(-10);
    const cleanNumber = `91${mobile10}`;

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

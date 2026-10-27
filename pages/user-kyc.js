'use strict';

const { escapeHtml } = require('../lib/page-utils');
const { addPanelChrome } = require('../lib/panel-chrome');

module.exports = function createUserKycPage({ db }) {
  function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(isoString).replace('T', ' ').slice(0, 19);
    }
  }

  async function sendUserKycPage(user, response) {
    // 1. Fetch user's existing KYC record
    const kycRes = await db.query(
      `SELECT id, user_id, gst_number, aadhar_number,
              aadhar_front_data, aadhar_back_data,
              pan_number, pan_card_data,
              status, rejection_reason, reviewed_at, submitted_at, updated_at
       FROM user_kyc
       WHERE user_id = $1`,
      [user.id]
    ).catch(() => ({ rowCount: 0, rows: [] }));

    const kyc = kycRes.rowCount > 0 ? kycRes.rows[0] : null;
    const status = kyc ? kyc.status : 'not_submitted';
    const isApproved = status === 'approved';
    const isPending = status === 'pending';
    const isRejected = status === 'rejected';
    const isNotSubmitted = status === 'not_submitted';

    // Status Banner config
    let statusBadgeHtml = '';
    let statusCardClass = '';
    let statusMessage = '';

    if (isApproved) {
      statusCardClass = 'border-success bg-light-success';
      statusBadgeHtml = '<span class="badge badge-success px-3 py-2 font-weight-bold" style="font-size:13px;background:#10b981;color:#fff;"><i class="fa fa-check-circle mr-1"></i> KYC Approved &amp; Verified</span>';
      statusMessage = `Your KYC documents were verified and approved on <strong>${escapeHtml(formatDateTime(kyc.reviewed_at || kyc.updated_at))}</strong>. Seller Payout and all services are active!`;
    } else if (isPending) {
      statusCardClass = 'border-warning bg-light-warning';
      statusBadgeHtml = '<span class="badge badge-warning px-3 py-2 font-weight-bold" style="font-size:13px;background:#f59e0b;color:#fff;"><i class="fa fa-clock-o mr-1"></i> Pending for Approval</span>';
      statusMessage = `Your KYC was submitted on <strong>${escapeHtml(formatDateTime(kyc.submitted_at))}</strong> and is currently under review by Admin. You will be notified once reviewed.`;
    } else if (isRejected) {
      statusCardClass = 'border-danger bg-light-danger';
      statusBadgeHtml = '<span class="badge badge-danger px-3 py-2 font-weight-bold" style="font-size:13px;background:#ef4444;color:#fff;"><i class="fa fa-times-circle mr-1"></i> KYC Rejected</span>';
      statusMessage = 'Your KYC verification was rejected by Admin. Please review the reason below and submit your Re-KYC with corrected details or clear documents.';
    } else {
      statusCardClass = 'border-primary bg-light-primary';
      statusBadgeHtml = '<span class="badge badge-secondary px-3 py-2 font-weight-bold" style="font-size:13px;background:#64748b;color:#fff;"><i class="fa fa-info-circle mr-1"></i> KYC Not Submitted</span>';
      statusMessage = 'Please complete your KYC by submitting your GST number, Aadhaar number (front &amp; back photos), and PAN number (photo).';
    }

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KYC Verification - User Panel</title>
  <link rel="stylesheet" href="/assets/plugins/bootstrap/css/bootstrap.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/dark.css">
  <link rel="stylesheet" href="/assets/css/skins.css">
  <link rel="stylesheet" href="/assets/css/icons.css">
  <style>
    .page-container {
      max-width: 1000px;
      margin: 20px auto 40px auto;
      padding: 0 16px;
    }
    .kyc-status-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
      background: #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }
    .bg-light-success { background: #f0fdf4 !important; border-color: #86efac !important; }
    .bg-light-warning { background: #fffbeb !important; border-color: #fde68a !important; }
    .bg-light-danger { background: #fef2f2 !important; border-color: #fecaca !important; }
    .bg-light-primary { background: #f8fafc !important; border-color: #cbd5e1 !important; }
    
    .doc-upload-box {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      background: #f8fafc;
      transition: all 0.2s ease-in-out;
      cursor: pointer;
      position: relative;
    }
    .doc-upload-box:hover {
      border-color: #2563eb;
      background: #eff6ff;
    }
    .doc-preview-img {
      max-height: 140px;
      max-width: 100%;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      object-fit: contain;
      background: #ffffff;
    }
    .preview-modal-img {
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .submitted-doc-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #ffffff;
      text-align: center;
    }
    .submitted-doc-card img {
      height: 120px;
      width: 100%;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      cursor: pointer;
      transition: transform 0.15s ease-in-out;
    }
    .submitted-doc-card img:hover {
      transform: scale(1.02);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-main">
      <div class="page-container">

        <!-- Page Header -->
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 class="font-weight-bold text-dark mb-1"><i class="fa fa-id-card-o text-primary mr-2"></i> KYC Verification</h4>
            <p class="text-muted small mb-0">Identity and business verification documents for your Exchange account.</p>
          </div>
          <div>
            <a href="/dashboard" class="btn btn-outline-secondary btn-sm"><i class="fa fa-arrow-left mr-1"></i> Dashboard</a>
          </div>
        </div>

        <!-- Status Card -->
        <div class="kyc-status-card ${statusCardClass}">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <h5 class="font-weight-bold text-dark mb-0"><i class="fa fa-shield mr-1"></i> Verification Status</h5>
            <div>${statusBadgeHtml}</div>
          </div>
          <p class="text-dark mb-0" style="font-size: 14.5px;">${statusMessage}</p>

          ${isRejected && kyc.rejection_reason ? `
            <div class="alert alert-danger mt-3 mb-0 py-2 px-3 border" style="background:#fee2e2;border-color:#f87171;">
              <strong class="text-danger d-block mb-1"><i class="fa fa-exclamation-triangle mr-1"></i> Admin Rejection Reason:</strong>
              <div class="text-dark bg-white p-2 rounded border font-monospace" style="font-size:13.5px;">${escapeHtml(kyc.rejection_reason)}</div>
              <small class="text-danger font-weight-bold mt-1 d-block"><i class="fa fa-info-circle mr-1"></i> Please update your details and re-upload clear photos below to Re-KYC.</small>
            </div>
          ` : ''}

          ${isApproved ? `
            <div class="mt-3 pt-3 border-top d-flex flex-wrap" style="gap:20px;">
              <div><small class="text-muted d-block">Aadhaar Number</small><strong class="font-monospace text-dark">${escapeHtml(kyc.aadhar_number)}</strong></div>
              <div><small class="text-muted d-block">PAN Number</small><strong class="font-monospace text-dark text-uppercase">${escapeHtml(kyc.pan_number)}</strong></div>
              ${kyc.gst_number ? `<div><small class="text-muted d-block">GST Number</small><strong class="font-monospace text-dark text-uppercase">${escapeHtml(kyc.gst_number)}</strong></div>` : ''}
              <div><small class="text-muted d-block">Approved On</small><strong class="text-dark">${escapeHtml(formatDateTime(kyc.reviewed_at || kyc.updated_at))}</strong></div>
            </div>
          ` : ''}
        </div>

        ${(isPending || isApproved) ? `
          <!-- Submitted Documents View -->
          <div class="card mb-4 shadow-sm border-0">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h6 class="font-weight-bold text-dark mb-0"><i class="fa fa-folder-open-o text-primary mr-2"></i> Submitted KYC Documents</h6>
              <span class="badge badge-light border text-muted">${isApproved ? 'Verified by Admin' : 'Under Review'}</span>
            </div>
            <div class="card-body p-4">
              <div class="row">
                <div class="col-md-4 mb-3">
                  <div class="submitted-doc-card">
                    <span class="font-weight-bold text-dark small d-block mb-2"><i class="fa fa-id-card-o text-primary mr-1"></i> Aadhaar Front</span>
                    ${kyc.aadhar_front_data ? `
                      <img src="${escapeHtml(kyc.aadhar_front_data)}" alt="Aadhaar Front" onclick="openDocPreview(this.src, 'Aadhaar Card Front')">
                      <button type="button" class="btn btn-outline-primary btn-sm btn-block mt-2" onclick="openDocPreview('${escapeHtml(kyc.aadhar_front_data)}', 'Aadhaar Card Front')">
                        <i class="fa fa-search-plus mr-1"></i> View Full Image
                      </button>
                    ` : '<div class="py-4 text-muted small">No image uploaded</div>'}
                  </div>
                </div>

                <div class="col-md-4 mb-3">
                  <div class="submitted-doc-card">
                    <span class="font-weight-bold text-dark small d-block mb-2"><i class="fa fa-id-card-o text-primary mr-1"></i> Aadhaar Back</span>
                    ${kyc.aadhar_back_data ? `
                      <img src="${escapeHtml(kyc.aadhar_back_data)}" alt="Aadhaar Back" onclick="openDocPreview(this.src, 'Aadhaar Card Back')">
                      <button type="button" class="btn btn-outline-primary btn-sm btn-block mt-2" onclick="openDocPreview('${escapeHtml(kyc.aadhar_back_data)}', 'Aadhaar Card Back')">
                        <i class="fa fa-search-plus mr-1"></i> View Full Image
                      </button>
                    ` : '<div class="py-4 text-muted small">No image uploaded</div>'}
                  </div>
                </div>

                <div class="col-md-4 mb-3">
                  <div class="submitted-doc-card">
                    <span class="font-weight-bold text-dark small d-block mb-2"><i class="fa fa-credit-card text-success mr-1"></i> PAN Card Photo</span>
                    ${kyc.pan_card_data ? `
                      <img src="${escapeHtml(kyc.pan_card_data)}" alt="PAN Card" onclick="openDocPreview(this.src, 'PAN Card Photo')">
                      <button type="button" class="btn btn-outline-success btn-sm btn-block mt-2" onclick="openDocPreview('${escapeHtml(kyc.pan_card_data)}', 'PAN Card Photo')">
                        <i class="fa fa-search-plus mr-1"></i> View Full Image
                      </button>
                    ` : '<div class="py-4 text-muted small">No image uploaded</div>'}
                  </div>
                </div>
              </div>

              <div class="bg-light p-3 rounded border mt-2">
                <div class="row small">
                  <div class="col-md-4">
                    <span class="text-muted d-block">Aadhaar Card Number:</span>
                    <strong class="font-monospace text-dark" style="font-size:14px;">${escapeHtml(kyc.aadhar_number || '-')}</strong>
                  </div>
                  <div class="col-md-4">
                    <span class="text-muted d-block">PAN Card Number:</span>
                    <strong class="font-monospace text-dark text-uppercase" style="font-size:14px;">${escapeHtml(kyc.pan_number || '-')}</strong>
                  </div>
                  <div class="col-md-4">
                    <span class="text-muted d-block">GST Number:</span>
                    <strong class="font-monospace text-dark text-uppercase" style="font-size:14px;">${escapeHtml(kyc.gst_number || 'N/A')}</strong>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ` : ''}

        ${(isNotSubmitted || isRejected) ? `
          <!-- KYC Submission / Re-KYC Form -->
          <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="card-title font-weight-bold text-dark mb-0">
                <i class="fa ${isRejected ? 'fa-refresh text-warning' : 'fa-pencil-square-o text-primary'} mr-2"></i>
                ${isRejected ? 'Re-Submit KYC Application (Re-KYC)' : 'Submit KYC Details &amp; Documents'}
              </h5>
              <span class="badge badge-primary px-2 py-1"><i class="fa fa-lock mr-1"></i> 256-bit Encrypted</span>
            </div>
            <div class="card-body p-4">
              
              <div id="submitAlert" class="alert alert-success font-weight-bold" style="display:none;"></div>
              <div id="submitError" class="alert alert-danger font-weight-bold" style="display:none;"></div>

              <form id="kycForm">
                
                <div class="row">
                  <!-- Aadhaar Number -->
                  <div class="col-md-4 form-group mb-3">
                    <label for="aadharNumber" class="font-weight-bold text-dark small">
                      Aadhaar Number <span class="text-danger">*</span>
                    </label>
                    <input type="text" class="form-control font-monospace" id="aadharNumber" maxlength="14" placeholder="12-digit Aadhaar Number" value="${escapeHtml(kyc?.aadhar_number || '')}" required>
                    <small class="form-text text-muted">12-digit Government UIDAI Aadhaar Number</small>
                  </div>

                  <!-- PAN Number -->
                  <div class="col-md-4 form-group mb-3">
                    <label for="panNumber" class="font-weight-bold text-dark small">
                      PAN Card Number <span class="text-danger">*</span>
                    </label>
                    <input type="text" class="form-control font-monospace text-uppercase" id="panNumber" maxlength="10" placeholder="10-digit PAN (e.g. ABCDE1234F)" value="${escapeHtml(kyc?.pan_number || '')}" required>
                    <small class="form-text text-muted">10-character Income Tax PAN Number</small>
                  </div>

                  <!-- GST Number -->
                  <div class="col-md-4 form-group mb-3">
                    <label for="gstNumber" class="font-weight-bold text-dark small">
                      GST Number <span class="text-muted">(Optional)</span>
                    </label>
                    <input type="text" class="form-control font-monospace text-uppercase" id="gstNumber" maxlength="15" placeholder="15-digit GSTIN" value="${escapeHtml(kyc?.gst_number || '')}">
                    <small class="form-text text-muted">If registered for GST (e.g. 09AAAAA0000A1Z5)</small>
                  </div>
                </div>

                <hr class="my-4">
                <h6 class="font-weight-bold text-dark mb-3"><i class="fa fa-camera text-primary mr-1"></i> Document Photo Uploads:</h6>

                <div class="row">
                  <!-- Aadhaar Front Photo -->
                  <div class="col-md-4 form-group mb-3">
                    <label class="font-weight-bold text-dark small mb-1">
                      Aadhaar Front Photo <span class="text-danger">*</span>
                    </label>
                    <div class="doc-upload-box" id="boxAadharFront" onclick="document.getElementById('fileAadharFront').click()">
                      <input type="file" id="fileAadharFront" accept="image/*,.pdf" style="display:none;">
                      <div id="previewWrapAadharFront">
                        ${kyc?.aadhar_front_data ? `
                          <img src="${escapeHtml(kyc.aadhar_front_data)}" class="doc-preview-img mb-2" id="imgAadharFront">
                          <div class="small text-success font-weight-bold"><i class="fa fa-check-circle"></i> Document Attached</div>
                          <small class="text-muted d-block">Click to change photo</small>
                        ` : `
                          <i class="fa fa-cloud-upload text-muted" style="font-size:32px;"></i>
                          <div class="font-weight-bold text-dark mt-2 small">Upload Aadhaar Front</div>
                          <small class="text-muted">JPG, PNG, WEBP or PDF (Max 5MB)</small>
                        `}
                      </div>
                    </div>
                  </div>

                  <!-- Aadhaar Back Photo -->
                  <div class="col-md-4 form-group mb-3">
                    <label class="font-weight-bold text-dark small mb-1">
                      Aadhaar Back Photo <span class="text-danger">*</span>
                    </label>
                    <div class="doc-upload-box" id="boxAadharBack" onclick="document.getElementById('fileAadharBack').click()">
                      <input type="file" id="fileAadharBack" accept="image/*,.pdf" style="display:none;">
                      <div id="previewWrapAadharBack">
                        ${kyc?.aadhar_back_data ? `
                          <img src="${escapeHtml(kyc.aadhar_back_data)}" class="doc-preview-img mb-2" id="imgAadharBack">
                          <div class="small text-success font-weight-bold"><i class="fa fa-check-circle"></i> Document Attached</div>
                          <small class="text-muted d-block">Click to change photo</small>
                        ` : `
                          <i class="fa fa-cloud-upload text-muted" style="font-size:32px;"></i>
                          <div class="font-weight-bold text-dark mt-2 small">Upload Aadhaar Back</div>
                          <small class="text-muted">JPG, PNG, WEBP or PDF (Max 5MB)</small>
                        `}
                      </div>
                    </div>
                  </div>

                  <!-- PAN Card Photo -->
                  <div class="col-md-4 form-group mb-3">
                    <label class="font-weight-bold text-dark small mb-1">
                      PAN Card Photo <span class="text-danger">*</span>
                    </label>
                    <div class="doc-upload-box" id="boxPanCard" onclick="document.getElementById('filePanCard').click()">
                      <input type="file" id="filePanCard" accept="image/*,.pdf" style="display:none;">
                      <div id="previewWrapPanCard">
                        ${kyc?.pan_card_data ? `
                          <img src="${escapeHtml(kyc.pan_card_data)}" class="doc-preview-img mb-2" id="imgPanCard">
                          <div class="small text-success font-weight-bold"><i class="fa fa-check-circle"></i> Document Attached</div>
                          <small class="text-muted d-block">Click to change photo</small>
                        ` : `
                          <i class="fa fa-cloud-upload text-muted" style="font-size:32px;"></i>
                          <div class="font-weight-bold text-dark mt-2 small">Upload PAN Card</div>
                          <small class="text-muted">JPG, PNG, WEBP or PDF (Max 5MB)</small>
                        `}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="alert alert-info py-2 px-3 small mt-2">
                  <i class="fa fa-info-circle mr-1"></i> <strong>Important Note:</strong> Please ensure that all document images are clear, unblurred, and all details (Name, Date of Birth, ID Numbers) are clearly readable. Aadhaar and PAN documents must match your registered account identity.
                </div>

                <div class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center">
                  <span class="text-muted small"><i class="fa fa-lock mr-1"></i> Data is safely transmitted over TLS</span>
                  <button type="submit" id="btnSubmitKyc" class="btn btn-primary font-weight-bold px-4 py-2 shadow-sm">
                    <i class="fa fa-upload mr-1"></i> ${isRejected ? 'Submit Re-KYC Application' : 'Submit KYC Application'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        ` : ''}

      </div>
    </div>
  </div>

  <!-- Full Image Preview Modal -->
  <div class="modal fade" id="docPreviewModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2 px-3 bg-light">
          <h6 class="modal-title font-weight-bold text-dark" id="docPreviewTitle">Document Preview</h6>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body p-3 text-center bg-dark">
          <img src="" id="docPreviewImage" class="preview-modal-img" alt="Document Preview">
        </div>
        <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
          <a href="#" id="docPreviewDownloadBtn" download="kyc-document" class="btn btn-outline-primary btn-sm">
            <i class="fa fa-download mr-1"></i> Download
          </a>
          <button type="button" class="btn btn-secondary btn-sm" data-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/assets/js/jquery-3.5.1.min.js"></script>
  <script src="/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/auth-client.js"></script>
  <script>
  (function() {
    let aadharFrontData = ${JSON.stringify(kyc?.aadhar_front_data || '')};
    let aadharBackData = ${JSON.stringify(kyc?.aadhar_back_data || '')};
    let panCardData = ${JSON.stringify(kyc?.pan_card_data || '')};

    function setupFileInput(fileInputId, previewWrapId, onDataReady) {
      const input = document.getElementById(fileInputId);
      const wrap = document.getElementById(previewWrapId);
      if (!input || !wrap) return;

      input.addEventListener('change', function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          alert('Selected file exceeds maximum limit of 5MB. Please choose a smaller file.');
          input.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
          const dataUrl = evt.target.result;
          onDataReady(dataUrl);
          wrap.innerHTML = '<img src="' + dataUrl + '" class="doc-preview-img mb-2">' +
                           '<div class="small text-success font-weight-bold"><i class="fa fa-check-circle"></i> ' + escapeHtmlClient(file.name) + '</div>' +
                           '<small class="text-muted d-block">Click to change</small>';
        };
        reader.readAsDataURL(file);
      });
    }

    function escapeHtmlClient(str) {
      return String(str || '').replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    setupFileInput('fileAadharFront', 'previewWrapAadharFront', function(d) { aadharFrontData = d; });
    setupFileInput('fileAadharBack', 'previewWrapAadharBack', function(d) { aadharBackData = d; });
    setupFileInput('filePanCard', 'previewWrapPanCard', function(d) { panCardData = d; });

    // Open image viewer modal
    window.openDocPreview = function(url, title) {
      if (!url) return;
      document.getElementById('docPreviewTitle').textContent = title || 'Document Preview';
      const img = document.getElementById('docPreviewImage');
      img.src = url;
      const downloadBtn = document.getElementById('docPreviewDownloadBtn');
      if (downloadBtn) downloadBtn.href = url;
      $('#docPreviewModal').modal('show');
    };

    // Form submission
    const form = document.getElementById('kycForm');
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btnSubmitKyc');
        const alertBox = document.getElementById('submitAlert');
        const errorBox = document.getElementById('submitError');

        alertBox.style.display = 'none';
        errorBox.style.display = 'none';

        const aadharNumber = document.getElementById('aadharNumber').value.replace(/\\s+/g, '').trim();
        const panNumber = document.getElementById('panNumber').value.replace(/\\s+/g, '').trim().toUpperCase();
        const gstNumber = document.getElementById('gstNumber').value.replace(/\\s+/g, '').trim().toUpperCase();

        if (!aadharNumber || aadharNumber.length < 12) {
          errorBox.textContent = 'Please enter a valid 12-digit Aadhaar number.';
          errorBox.style.display = 'block';
          document.getElementById('aadharNumber').focus();
          return;
        }

        if (!panNumber || panNumber.length !== 10) {
          errorBox.textContent = 'Please enter a valid 10-character PAN card number (e.g. ABCDE1234F).';
          errorBox.style.display = 'block';
          document.getElementById('panNumber').focus();
          return;
        }

        if (!aadharFrontData) {
          errorBox.textContent = 'Please upload your Aadhaar Card Front photo.';
          errorBox.style.display = 'block';
          return;
        }

        if (!aadharBackData) {
          errorBox.textContent = 'Please upload your Aadhaar Card Back photo.';
          errorBox.style.display = 'block';
          return;
        }

        if (!panCardData) {
          errorBox.textContent = 'Please upload your PAN Card photo.';
          errorBox.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Uploading &amp; Submitting...';

        const payload = {
          aadharNumber,
          panNumber,
          gstNumber,
          aadharFront: aadharFrontData,
          aadharBack: aadharBackData,
          panCard: panCardData,
        };

        try {
          const res = await fetch('/api/user/kyc/submit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to submit KYC.');

          alertBox.innerHTML = '<i class="fa fa-check-circle mr-1"></i> ' + (data.message || 'KYC submitted successfully! Refreshing...');
          alertBox.style.display = 'block';
          setTimeout(function() {
            location.reload();
          }, 1500);
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa fa-upload mr-1"></i> Submit KYC Application';
        }
      });
    }

  })();
  </script>
</body>
</html>`;

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await addPanelChrome(html, { role: 'user', userId: user.id, db, currentPath: '/kyc' }));
  }

  return { sendUserKycPage };
};

/**
 * TexPlanning ERP - Unified Single-Screen Planning Frontend
 */

// Storage keys
const TOKEN_KEY = 'texplanning_token';
const USER_KEY = 'texplanning_user';

// State
let currentPage = 1;
const pageSize = 20;
let totalPages = 1;
let currentOrders = [];
const uniqueBuyers = new Set();

// DOM Elements
const userNavSection = document.getElementById('userNavSection');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const openLoginBtn = document.getElementById('openLoginBtn');
const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');

const searchInput = document.getElementById('searchInput');
const buyerFilter = document.getElementById('buyerFilter');
const statusFilter = document.getElementById('statusFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const refreshBtn = document.getElementById('refreshBtn');

const masterTable = document.getElementById('masterTable');
const ordersTableBody = document.getElementById('ordersTableBody');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const paginationInfo = document.getElementById('paginationInfo');
const pageIndicator = document.getElementById('pageIndicator');

const toggleUploadBtn = document.getElementById('toggleUploadBtn');
const uploadWrapper = document.getElementById('uploadWrapper');
const dropzone = document.getElementById('dropzone');
const excelFileInput = document.getElementById('excelFileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatusText = document.getElementById('uploadStatusText');
const uploadAlert = document.getElementById('uploadAlert');

const kpiTotalOrders = document.getElementById('kpiTotalOrders');
const kpiKnittingActive = document.getElementById('kpiKnittingActive');
const kpiDyeingActive = document.getElementById('kpiDyeingActive');
const kpiPendingDelivery = document.getElementById('kpiPendingDelivery');
const kpiTotalQty = document.getElementById('kpiTotalQty');
const toastContainer = document.getElementById('toastContainer');

// Auth Helpers
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  const data = localStorage.getItem(USER_KEY);
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  renderUserNav();
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  renderUserNav();
}

/**
 * Authenticated fetch wrapper injecting Authorization Bearer token
 */
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    if (token) {
      showToast('Session expired or unauthorized. Please sign in.', 'error');
      clearAuth();
    }
    openModal();
  }

  return response;
}

// Render User Navigation Bar
function renderUserNav() {
  const user = getUser();
  if (user) {
    userNavSection.innerHTML = `
      <div class="user-profile">
        <span>Logged in as <strong>${escapeHtml(user.username)}</strong></span>
        <span class="user-badge">${escapeHtml(user.role || 'User')}</span>
        <button class="btn btn-sm btn-outline" id="logoutBtn">Logout</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearAuth();
      showToast('Logged out successfully.', 'info');
      loadOrders(1);
    });
  } else {
    userNavSection.innerHTML = `
      <button class="btn btn-primary" id="openLoginBtn">Login</button>
    `;
    document.getElementById('openLoginBtn').addEventListener('click', openModal);
  }
}

function openModal() {
  loginModal.style.display = 'flex';
  loginError.style.display = 'none';
}

function closeModal() {
  loginModal.style.display = 'none';
}

if (closeLoginModalBtn) {
  closeLoginModalBtn.addEventListener('click', closeModal);
}

// Handle Login Submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.token) {
      setAuth(data.token, data.user);
      closeModal();
      showToast(`Welcome back, ${data.user.username}!`, 'success');
      loadOrders(1);
    } else {
      loginError.textContent = data.message || 'Login failed. Check username and password.';
      loginError.style.display = 'block';
    }
  } catch (err) {
    loginError.textContent = 'Server connection error.';
    loginError.style.display = 'block';
  }
});

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

// Fetch and Populate Orders
async function loadOrders(page = 1) {
  ordersTableBody.innerHTML = `
    <tr>
      <td colspan="17" class="loading-state">
        <div class="spinner"></div>
        <span>Loading production planning data...</span>
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      page,
      limit: pageSize
    });

    const searchVal = searchInput.value.trim();
    const buyerVal = buyerFilter.value.trim();
    const statusVal = statusFilter.value.trim();

    if (searchVal) params.append('search', searchVal);
    if (buyerVal) params.append('buyer', buyerVal);
    if (statusVal) params.append('status', statusVal);

    const res = await authFetch(`/api/orders?${params.toString()}`);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        ordersTableBody.innerHTML = `
          <tr>
            <td colspan="17" class="empty-state">
              Please sign in with valid credentials to view planning records.
            </td>
          </tr>
        `;
        return;
      }
      throw new Error(`Server returned ${res.status}`);
    }

    const json = await res.json();
    currentOrders = json.data || [];
    currentPage = json.pagination?.page || 1;
    totalPages = json.pagination?.totalPages || 1;
    const totalCount = json.pagination?.total || 0;

    renderOrdersTable(currentOrders);
    updateKPIs(currentOrders, totalCount);
    updatePagination(totalCount);
    updateBuyerFilterOptions(currentOrders);

  } catch (err) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="17" class="empty-state">
          Unable to load orders: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

// Render Master Table Rows
function renderOrdersTable(orders) {
  if (!orders || orders.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="17" class="empty-state">
          No planning records match your current criteria. Upload a spreadsheet to populate data.
        </td>
      </tr>
    `;
    return;
  }

  ordersTableBody.innerHTML = '';

  orders.forEach((order) => {
    const general = order.generalInfo || {};
    const knitting = (order.knittingPlan && order.knittingPlan[0]) || {};
    const dyeing = (order.dyeingPlan && order.dyeingPlan[0]) || {};
    const delivery = (order.deliveryPlan && order.deliveryPlan[0]) || {};

    const tr = document.createElement('tr');
    tr.id = `row-${order._id}`;

    tr.innerHTML = `
      <!-- General Info (Columns 1-4) -->
      <td>
        <strong>${escapeHtml(order.orderNo)}</strong>
      </td>
      <td>
        <span>${escapeHtml(general.buyer || order.buyer || '-')}</span>
      </td>
      <td>
        <div>${escapeHtml(general.style || order.style || '-')}</div>
        <small style="color: #64748b;">${escapeHtml(general.season || '')}</small>
      </td>
      <td class="cell-general-end">
        <div><strong>${Number(general.totalOrderQty || 0).toLocaleString()}</strong> pcs</div>
        <small style="color: #64748b;">Ship: ${formatDate(general.lastShipDate)}</small>
      </td>

      <!-- Knitting Stage (Blue - Columns 5-8) -->
      <td>
        <input type="number" class="cell-input cell-input-num" data-field="knitQty" value="${knitting.knitQty ?? 0}" step="0.1" />
      </td>
      <td>
        <input type="date" class="cell-input cell-input-date" data-field="yarnInhouseDate" value="${formatDate(knitting.yarnInhouseDate)}" />
      </td>
      <td>
        <div style="display: flex; gap: 2px;">
          <input type="date" class="cell-input cell-input-date" title="Start Date" data-field="knitStartDate" value="${formatDate(knitting.knitStartDate)}" />
          <input type="date" class="cell-input cell-input-date" title="End Date" data-field="knitEndDate" value="${formatDate(knitting.knitEndDate)}" />
        </div>
      </td>
      <td class="cell-knitting-end">
        <select class="cell-input" data-field="knitStatus">
          <option value="Pending" ${knitting.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${knitting.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${knitting.status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </td>

      <!-- Dyeing Stage (Purple - Columns 9-12) -->
      <td>
        <input type="number" class="cell-input cell-input-num" data-field="dyeQty" value="${dyeing.dyeQty ?? 0}" step="0.1" />
      </td>
      <td>
        <input type="text" class="cell-input" placeholder="Unit / Process" data-field="dyeingUnit" value="${escapeHtml(dyeing.dyeingUnit || dyeing.processName || '')}" />
      </td>
      <td>
        <div style="display: flex; gap: 2px;">
          <input type="date" class="cell-input cell-input-date" title="Start Date" data-field="dyeStartDate" value="${formatDate(dyeing.dyeStartDate)}" />
          <input type="date" class="cell-input cell-input-date" title="End Date" data-field="dyeEndDate" value="${formatDate(dyeing.dyeEndDate)}" />
        </div>
      </td>
      <td class="cell-dyeing-end">
        <select class="cell-input" data-field="dyeStatus">
          <option value="Pending" ${dyeing.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${dyeing.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${dyeing.status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </td>

      <!-- Delivery Stage (Green - Columns 13-16) -->
      <td>
        <input type="date" class="cell-input cell-input-date" data-field="deliveryTargetDate" value="${formatDate(delivery.deliveryTargetDate)}" />
      </td>
      <td>
        <input type="number" class="cell-input cell-input-num" data-field="deliveredQty" value="${delivery.deliveredQty ?? 0}" step="0.1" />
      </td>
      <td>
        <span class="badge ${delivery.balanceQty > 0 ? 'badge-delivery' : 'badge-success'}" id="bal-${order._id}">
          ${Number(delivery.balanceQty || 0).toLocaleString()} Kg
        </span>
      </td>
      <td class="cell-delivery-end">
        <select class="cell-input" data-field="overallStatus">
          <option value="Pending" ${(order.overallStatus || delivery.status) === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${(order.overallStatus || delivery.status) === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${(order.overallStatus || delivery.status) === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </td>

      <!-- Action (Column 17) -->
      <td>
        <button class="btn btn-sm btn-primary save-row-btn" data-id="${order._id}">Save</button>
      </td>
    `;

    // Mark dirty on changes
    tr.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('change', () => {
        tr.classList.add('row-dirty');

        // Dynamic balance recalculation if delivered quantity changed
        if (input.dataset.field === 'deliveredQty') {
          const allocated = Number(knitting.allocatedQty || general.totalOrderQty || 0);
          const delivered = Number(input.value || 0);
          const bal = Math.max(0, allocated - delivered);
          const balBadge = document.getElementById(`bal-${order._id}`);
          if (balBadge) balBadge.textContent = `${bal.toLocaleString()} Kg`;
        }
      });
    });

    // Save button event listener
    const saveBtn = tr.querySelector('.save-row-btn');
    saveBtn.addEventListener('click', () => saveOrderRow(order._id, tr, order));

    ordersTableBody.appendChild(tr);
  });
}

// Inline Save Row Handler
async function saveOrderRow(orderId, tr, originalOrder) {
  const saveBtn = tr.querySelector('.save-row-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const knitQty = parseFloat(tr.querySelector('[data-field="knitQty"]').value) || 0;
    const yarnInhouseDate = tr.querySelector('[data-field="yarnInhouseDate"]').value || null;
    const knitStartDate = tr.querySelector('[data-field="knitStartDate"]').value || null;
    const knitEndDate = tr.querySelector('[data-field="knitEndDate"]').value || null;
    const knitStatus = tr.querySelector('[data-field="knitStatus"]').value;

    const dyeQty = parseFloat(tr.querySelector('[data-field="dyeQty"]').value) || 0;
    const dyeingUnit = tr.querySelector('[data-field="dyeingUnit"]').value.trim();
    const dyeStartDate = tr.querySelector('[data-field="dyeStartDate"]').value || null;
    const dyeEndDate = tr.querySelector('[data-field="dyeEndDate"]').value || null;
    const dyeStatus = tr.querySelector('[data-field="dyeStatus"]').value;

    const deliveryTargetDate = tr.querySelector('[data-field="deliveryTargetDate"]').value || null;
    const deliveredQty = parseFloat(tr.querySelector('[data-field="deliveredQty"]').value) || 0;
    const overallStatus = tr.querySelector('[data-field="overallStatus"]').value;

    // Build payload preserving existing array items
    const existingKnit = originalOrder.knittingPlan?.[0] || {};
    const existingDye = originalOrder.dyeingPlan?.[0] || {};
    const existingDel = originalOrder.deliveryPlan?.[0] || {};

    const updatedKnittingPlan = [{
      ...existingKnit,
      knitQty,
      yarnInhouseDate,
      knitStartDate,
      knitEndDate,
      status: knitStatus
    }];

    const updatedDyeingPlan = [{
      ...existingDye,
      dyeQty,
      dyeingUnit,
      dyeStartDate,
      dyeEndDate,
      status: dyeStatus
    }];

    const allocated = Number(existingDel.allocatedQty || originalOrder.generalInfo?.totalOrderQty || 0);
    const balanceQty = Math.max(0, allocated - deliveredQty);

    const updatedDeliveryPlan = [{
      ...existingDel,
      deliveryTargetDate,
      deliveredQty,
      balanceQty,
      status: overallStatus
    }];

    const payload = {
      knittingPlan: updatedKnittingPlan,
      dyeingPlan: updatedDyeingPlan,
      deliveryPlan: updatedDeliveryPlan,
      overallStatus
    };

    const res = await authFetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      tr.classList.remove('row-dirty');
      showToast(`Order ${originalOrder.orderNo} updated successfully.`, 'success');
    } else {
      showToast(data.message || 'Failed to update order.', 'error');
    }
  } catch (err) {
    showToast(`Error saving order: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// KPI Counters
function updateKPIs(orders, totalCount) {
  kpiTotalOrders.textContent = totalCount.toLocaleString();

  let activeKnitting = 0;
  let activeDyeing = 0;
  let pendingDelivery = 0;
  let totalQtySum = 0;

  orders.forEach((o) => {
    const k = o.knittingPlan?.[0];
    const d = o.dyeingPlan?.[0];
    const del = o.deliveryPlan?.[0];

    if (k && (k.status === 'In Progress' || (k.knitQty > 0 && k.status !== 'Completed'))) {
      activeKnitting++;
    }
    if (d && (d.status === 'In Progress' || (d.dyeQty > 0 && d.status !== 'Completed'))) {
      activeDyeing++;
    }
    if (del && (del.balanceQty > 0 || del.status === 'Pending')) {
      pendingDelivery++;
    }

    totalQtySum += Number(o.generalInfo?.totalOrderQty || o.totalOrderQty || 0);
  });

  kpiKnittingActive.textContent = activeKnitting;
  kpiDyeingActive.textContent = activeDyeing;
  kpiPendingDelivery.textContent = pendingDelivery;
  kpiTotalQty.textContent = Math.round(totalQtySum).toLocaleString();
}

// Pagination
function updatePagination(totalCount) {
  paginationInfo.textContent = `Showing ${currentOrders.length} of ${totalCount.toLocaleString()} orders`;
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;

  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) loadOrders(currentPage - 1);
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) loadOrders(currentPage + 1);
});

// Buyer Filter Dropdown Options
function updateBuyerFilterOptions(orders) {
  let changed = false;
  orders.forEach((o) => {
    const b = o.buyer || o.generalInfo?.buyer;
    if (b && !uniqueBuyers.has(b)) {
      uniqueBuyers.add(b);
      changed = true;
    }
  });

  if (changed) {
    const currentVal = buyerFilter.value;
    buyerFilter.innerHTML = '<option value="">All Buyers</option>';
    Array.from(uniqueBuyers).sort().forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      if (b === currentVal) opt.selected = true;
      buyerFilter.appendChild(opt);
    });
  }
}

// Filter Event Listeners
applyFiltersBtn.addEventListener('click', () => loadOrders(1));
searchInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') loadOrders(1);
});
resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  buyerFilter.value = '';
  statusFilter.value = '';
  loadOrders(1);
});
refreshBtn.addEventListener('click', () => loadOrders(currentPage));

// Toggle Excel Importer Area
toggleUploadBtn.addEventListener('click', () => {
  const isHidden = uploadWrapper.style.display === 'none';
  uploadWrapper.style.display = isHidden ? 'flex' : 'none';
});

// Drag and Drop File Upload
if (browseBtn) {
  browseBtn.addEventListener('click', () => excelFileInput.click());
}

dropzone.addEventListener('click', (e) => {
  if (e.target !== browseBtn) excelFileInput.click();
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files && files.length > 0) {
    handleFileUpload(files[0]);
  }
});

excelFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileUpload(e.target.files[0]);
  }
});

async function handleFileUpload(file) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    showUploadAlert('Please select a valid Excel file (.xlsx or .xls).', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  uploadProgressContainer.style.display = 'block';
  uploadProgressBar.style.width = '35%';
  uploadStatusText.textContent = `Uploading and parsing ${file.name}...`;
  uploadAlert.style.display = 'none';

  try {
    uploadProgressBar.style.width = '70%';

    const res = await authFetch('/api/orders/upload-excel', {
      method: 'POST',
      body: formData
    });

    uploadProgressBar.style.width = '100%';
    const data = await res.json();

    if (res.ok && data.success) {
      showUploadAlert(
        `Success: ${data.message} Detected ${data.summary?.ordersDetected || 0} orders (Upserted: ${data.summary?.upsertedCount || 0}, Updated: ${data.summary?.modifiedCount || 0}).`,
        'success'
      );
      showToast('Excel uploaded and database synchronized!', 'success');
      loadOrders(1);
    } else {
      showUploadAlert(data.message || 'Excel processing failed.', 'error');
      showToast(data.message || 'Upload failed.', 'error');
    }
  } catch (err) {
    showUploadAlert(`Upload error: ${err.message}`, 'error');
    showToast('Upload failed due to connection error.', 'error');
  } finally {
    setTimeout(() => {
      uploadProgressContainer.style.display = 'none';
      uploadProgressBar.style.width = '0%';
      excelFileInput.value = '';
    }, 2500);
  }
}

function showUploadAlert(msg, type) {
  uploadAlert.textContent = msg;
  uploadAlert.className = `upload-alert ${type}`;
  uploadAlert.style.display = 'block';
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  renderUserNav();
  loadOrders(1);
});

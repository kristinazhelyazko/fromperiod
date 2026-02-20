// Глобальное состояние приложения
let appState = {
    currentScreen: 'main-menu',
    stock: {
        date: new Date().toISOString().split('T')[0], // Текущая дата по умолчанию
        addressId: null,
        categoryId: null,
        reportId: null,
        items: [],
        isSaved: false
    },
    replenish: {
        date: new Date().toISOString().split('T')[0], // Текущая дата по умолчанию
        addressId: null,
        categoryId: null,
        replenishId: null,
        items: [],
        isSaved: false
    }
};

// Calendar State
let calendarState = {
    currentWeekStart: new Date(), // For display week
    stockSelectedDate: new Date(),
    replenishSelectedDate: new Date()
};

// Helper to get Monday of the current week
function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

// Показ экрана
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const targetId = screenName === 'main-menu' ? 'main-menu' : `${screenName}-screen`;
    const target = document.getElementById(targetId);
    if (target) target.classList.add('active');
    appState.currentScreen = screenName;
    
    if (screenName !== 'stock') {
        hideStockOutputs();
    }
    if (screenName !== 'replenish') {
        hideReplenishOutputs();
    }

    if (screenName === 'stock') {
        initCalendar('stock');
    } else if (screenName === 'replenish') {
        initCalendar('replenish');
    }
}

function hideStockOutputs() {
    const info = document.getElementById('stock-report-info');
    const editBtn = document.getElementById('edit-stock-btn');
    const genBtn = document.getElementById('generate-order-btn');
    const saveBtn = document.getElementById('save-stock-btn');
    const order = document.getElementById('order-result');
    if (info) info.style.display = 'none';
    if (order) order.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (genBtn) genBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
}

function hideReplenishOutputs() {
    const info = document.getElementById('replenish-info');
    const copy = document.getElementById('replenish-copy-text');
    const editBtn = document.getElementById('edit-replenish-btn');
    const saveBtn = document.getElementById('save-replenish-btn');
    if (info) info.style.display = 'none';
    if (copy) copy.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
}

// Навигация назад
function goBack(context) {
    if (hasUnsavedChanges(context)) {
        openConfirmExit(context);
        return;
    }
    if (context === 'stock') {
        resetStockState();
        showScreen('main-menu');
    } else if (context === 'replenish') {
        resetReplenishState();
        showScreen('main-menu');
    }
}

function hasUnsavedChanges(context) {
    const state = context === 'stock' ? appState.stock : appState.replenish;
    if (state.isSaved) return false;
    const itemsStep = document.getElementById(context === 'stock' ? 'stock-items' : 'replenish-items');
    const isItemsActive = itemsStep && itemsStep.classList.contains('active');
    if (!isItemsActive) return false;
    return !!(state.addressId || state.categoryId || (state.items && state.items.length > 0));
}

function openConfirmExit(context) {
    const modal = document.getElementById('confirm-modal');
    const message = document.getElementById('confirm-message');
    message.textContent = 'Вы действительно хотите выйти? Несохраненные данные будут потеряны.';
    modal.style.display = 'flex';
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    yesBtn.onclick = () => {
        modal.style.display = 'none';
        if (context === 'stock') {
            resetStockState();
        } else {
            resetReplenishState();
        }
        showScreen('main-menu');
    };
    noBtn.onclick = () => {
        modal.style.display = 'none';
    };
}

function openTextInputModal(message, onConfirm) {
    const modal = document.getElementById('input-modal');
    const msg = document.getElementById('input-message');
    const input = document.getElementById('input-modal-text');
    const qtyInput = document.getElementById('input-modal-qty');
    const yesBtn = document.getElementById('input-yes');
    const noBtn = document.getElementById('input-no');
    msg.textContent = message || '';
    input.value = '';
    if (qtyInput) qtyInput.value = '';
    modal.style.display = 'block';
    yesBtn.onclick = () => {
        const value = input.value;
        const qtyValue = qtyInput ? qtyInput.value : undefined;
        modal.style.display = 'none';
        if (typeof onConfirm === 'function') onConfirm(value, qtyValue);
    };
    noBtn.onclick = () => {
        modal.style.display = 'none';
    };
}

function openAddItemModal(onConfirm) {
    const modal = document.getElementById('input-modal');
    const msg = document.getElementById('input-message');
    const nameInput = document.getElementById('input-modal-text');
    const qtyInput = document.getElementById('input-modal-qty');
    const yesBtn = document.getElementById('input-yes');
    const noBtn = document.getElementById('input-no');
    msg.textContent = 'Введите наименование и количество';
    nameInput.value = '';
    qtyInput.value = '';
    modal.style.display = 'block';
    yesBtn.onclick = () => {
        const name = nameInput.value;
        const qty = parseInt(qtyInput.value, 10);
        modal.style.display = 'none';
        if (typeof onConfirm === 'function') onConfirm({ name, qty: isNaN(qty) ? 0 : Math.max(0, qty) });
    };
    noBtn.onclick = () => {
        modal.style.display = 'none';
    };
}

// Сброс состояния пересчета
function resetStockState() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    appState.stock = {
        date: todayStr,
        addressId: null,
        categoryId: null,
        reportId: null,
        items: [],
        isSaved: false
    };
    calendarState.stockSelectedDate = today;
    
    const displayStr = formatDateForDisplay(today);
    document.getElementById('stock-date-input').value = displayStr;
    
    document.getElementById('stock-address-selection').classList.add('active');
    document.getElementById('stock-category-selection').classList.remove('active');
    document.getElementById('stock-items').classList.remove('active');
    document.getElementById('category-buttons').innerHTML = '';
    document.getElementById('stock-table-body').innerHTML = '';
    hideStockOutputs();
}

// Сброс состояния привоза
function resetReplenishState() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    appState.replenish = {
        date: todayStr,
        addressId: null,
        categoryId: null,
        replenishId: null,
        items: [],
        isSaved: false
    };
    calendarState.replenishSelectedDate = today;
    
    const displayStr = formatDateForDisplay(today);
    document.getElementById('replenish-date-input').value = displayStr;
    
    document.getElementById('replenish-address-selection').classList.add('active');
    document.getElementById('replenish-category-selection').classList.remove('active');
    document.getElementById('replenish-items').classList.remove('active');
    document.getElementById('replenish-category-buttons').innerHTML = '';
    document.getElementById('replenish-table-body').innerHTML = '';
    hideReplenishOutputs();
}

// Helpers
function formatDateForDisplay(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatTimeForDisplay(date) {
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
}

function getTextFromHtmlPreview(elementId) {
    const content = document.getElementById(elementId);
    const lines = [];
    
    // Headers
    const headerDivs = content.querySelectorAll('.order-preview-header div');
    headerDivs.forEach(div => lines.push(div.textContent));
    
    lines.push('');
    const subtitle = content.querySelector('.order-preview-subtitle');
    if (subtitle) {
        lines.push(subtitle.textContent);
        lines.push('');
    }
    
    // Content
    const itemDivs = content.querySelectorAll('.order-preview-content div');
    itemDivs.forEach(div => lines.push(div.textContent));
    
    return lines.join('\n');
}

// Update date display span
function updateDateDisplay(context, text) {
    const span = document.getElementById(context === 'stock' ? 'stock-date-display' : 'replenish-date-display');
    if (span) span.textContent = text;
}

// Показ уведомления
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    // Set background color based on type
    if (type === 'error') {
        notification.style.backgroundColor = '#93733B'; // Mustard
        notification.style.color = '#F5F4F5'; // White
    } else {
        notification.style.backgroundColor = '#2D4920'; // Dark Green for success
        notification.style.color = '#F5F4F5'; // White
    }

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Копирование в буфер обмена
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Скопировано в буфер обмена!', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showNotification('Ошибка копирования', 'error');
    }
}

async function getAddressNameById(addressId) {
    try {
        const addresses = await api.getAddresses();
        const address = addresses.find(addr => addr.id === addressId);
        return address ? address.name : 'Не указан';
    } catch (error) {
        showNotification('Ошибка загрузки адреса: ' + error.message, 'error');
        return 'Не указан';
    }
}

async function getCategoryNameById(addressId, categoryId) {
    try {
        const categories = await api.getCategories(addressId);
        const category = categories.find(cat => cat.id === categoryId);
        return category ? category.name : 'Не указана';
    } catch (error) {
        showNotification('Ошибка загрузки категории: ' + error.message, 'error');
        return 'Не указана';
    }
}

// Загрузка адресов
async function loadAddresses() {
    try {
        const addresses = await api.getAddresses();
        const container = document.getElementById('address-buttons');
        container.innerHTML = '';
        
        addresses.forEach(addr => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = addr.name;
            btn.onclick = () => selectStockAddress(addr.id, addr.name);
            container.appendChild(btn);
        });
    } catch (error) {
        showNotification('Ошибка загрузки адресов: ' + error.message, 'error');
    }
}

// Загрузка адресов для привоза
async function loadReplenishAddresses() {
    try {
        const addresses = await api.getAddresses();
        const container = document.getElementById('replenish-address-buttons');
        container.innerHTML = '';
        
        addresses.forEach(addr => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = addr.name;
            btn.onclick = () => selectReplenishAddress(addr.id, addr.name);
            container.appendChild(btn);
        });
    } catch (error) {
        showNotification('Ошибка загрузки адресов: ' + error.message, 'error');
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    loadAddresses();
    loadReplenishAddresses();
    
    // Init dates
    const today = new Date();
    const displayStr = formatDateForDisplay(today);
    document.getElementById('stock-date-input').value = displayStr;
    document.getElementById('replenish-date-input').value = displayStr;
    updateDateDisplay('stock', displayStr);
    updateDateDisplay('replenish', displayStr);
});


// --- Calendar Logic ---

function initCalendar(context) {
    calendarState.currentWeekStart = getMonday(new Date()); // Reset view to current week
    renderCalendar(context);
}

function renderCalendar(context) {
    const startOfWeek = new Date(calendarState.currentWeekStart);
    const year = startOfWeek.getFullYear();
    const month = startOfWeek.getMonth(); // Month of the start of the week
    
    // Update Header
    const monthNames = ["ЯНВАРЬ", "ФЕВРАЛЬ", "МАРТ", "АПРЕЛЬ", "МАЙ", "ИЮНЬ", "ИЮЛЬ", "АВГУСТ", "СЕНТЯБРЬ", "ОКТЯБРЬ", "НОЯБРЬ", "ДЕКАБРЬ"];
    const headerId = context === 'stock' ? 'calendar-month-year' : 'replenish-calendar-month-year';
    
    // If week spans two months/years, maybe show both or just the month of the selected date?
    // Simplified: show Month of the first day of week (or majority).
    // Let's stick to the start of week month.
    document.getElementById(headerId).textContent = `${monthNames[month]} ${year}`;
    
    // Grid
    const gridId = context === 'stock' ? 'calendar-grid' : 'replenish-calendar-grid';
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    
    // Days of week headers (names)
    const days = ["п", "в", "с", "ч", "п", "с", "в"]; // Lowercase as per screenshot
    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'calendar-day-name';
        div.textContent = d;
        grid.appendChild(div);
    });
    
    // Days logic (7 days of the week)
    const selectedDate = context === 'stock' ? calendarState.stockSelectedDate : calendarState.replenishSelectedDate;
    
    for (let i = 0; i < 7; i++) {
        const currentDayDate = new Date(startOfWeek);
        currentDayDate.setDate(startOfWeek.getDate() + i);
        
        const div = document.createElement('div');
        div.className = 'calendar-day';
        div.textContent = currentDayDate.getDate();
        
        const dateStr = currentDayDate.toISOString().split('T')[0];
        const selectedStr = selectedDate.toISOString().split('T')[0];
        
        if (dateStr === selectedStr) {
            div.classList.add('selected');
        }
        
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateStr === todayStr) {
            div.classList.add('today');
        }
        
        div.onclick = () => selectDate(currentDayDate, context);
        grid.appendChild(div);
    }
}

function changeMonth(delta) {
    // Actually changes Week now
    const newDate = new Date(calendarState.currentWeekStart);
    newDate.setDate(newDate.getDate() + (delta * 7));
    calendarState.currentWeekStart = newDate;
    renderCalendar('stock');
}

function changeReplenishMonth(delta) {
    // Actually changes Week now
    const newDate = new Date(calendarState.currentWeekStart);
    newDate.setDate(newDate.getDate() + (delta * 7));
    calendarState.currentWeekStart = newDate;
    renderCalendar('replenish');
}

function selectDate(date, context) {
    const dateStr = date.toISOString().split('T')[0];
    const displayStr = formatDateForDisplay(date);
    
    if (context === 'stock') {
        calendarState.stockSelectedDate = date;
        appState.stock.date = dateStr;
        document.getElementById('stock-date-input').value = displayStr;
        updateDateDisplay('stock', displayStr);
        renderCalendar('stock');
        if (typeof checkExistingStock === 'function') {
            checkExistingStock().then(() => {
                if (document.getElementById('stock-items').classList.contains('active')) {
                    if (typeof renderStockTable === 'function') renderStockTable();
                }
            });
        }
    } else {
        calendarState.replenishSelectedDate = date;
        appState.replenish.date = dateStr;
        document.getElementById('replenish-date-input').value = displayStr;
        updateDateDisplay('replenish', displayStr);
        renderCalendar('replenish');
        if (typeof checkExistingReplenish === 'function') {
            checkExistingReplenish();
        }
    }
}

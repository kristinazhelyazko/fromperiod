// Выбор адреса для привоза
async function selectReplenishAddress(addressId, addressName) {
    appState.replenish.addressId = addressId;
    appState.replenish.addressName = addressName;
    
    try {
        const categories = await api.getCategories(addressId);
        const container = document.getElementById('replenish-category-buttons');
        container.innerHTML = '';
        
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = cat.name;
            btn.onclick = () => selectReplenishCategory(cat.id, cat.name);
            container.appendChild(btn);
        });
        
        document.getElementById('replenish-address-selection').classList.remove('active');
        document.getElementById('replenish-category-selection').classList.add('active');
    } catch (error) {
        showNotification('Ошибка загрузки категорий: ' + error.message, 'error');
    }
}

// Выбор категории для привоза
function selectReplenishCategory(categoryId, categoryName) {
    appState.replenish.categoryId = categoryId;
    appState.replenish.categoryName = categoryName;
    
    document.getElementById('replenish-category-selection').classList.remove('active');
    document.getElementById('replenish-items').classList.add('active');

    prepareReplenishItemsUI();
    renderReplenishTable();
    checkExistingReplenish();
}

// Поиск позиций с debounce
let searchTimeout;
function searchItems(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 3) {
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const results = await api.searchItems(
                appState.replenish.addressId,
                appState.replenish.categoryId,
                query
            );
            
            const container = document.getElementById('search-results');
            container.innerHTML = '';
            
            if (results.length > 0) {
                container.style.display = 'block';
                results.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.style.padding = '10px';
                    div.style.borderBottom = '1px solid #eee';
                    div.style.cursor = 'pointer';
                    const sec = item.section_name || 'Без раздела';
                    const displayName = `${item.name} (${sec})`;
                    div.textContent = displayName;
                    div.onmouseover = () => div.style.backgroundColor = '#f0f0f0';
                    div.onmouseout = () => div.style.backgroundColor = 'transparent';
                    div.onclick = () => addItemToReplenish(item.id, displayName);
                    container.appendChild(div);
                });
            } else {
                container.style.display = 'none';
            }
        } catch (error) {
            showNotification('Ошибка поиска: ' + error.message, 'error');
        }
    }, 500);
}

// Добавление позиции в привоз
function addItemToReplenish(itemId, itemName) {
    // Проверяем, не добавлена ли уже эта позиция
    if (appState.replenish.items.find(item => item.itemId === itemId)) {
        showNotification('Эта позиция уже добавлена', 'error');
        return;
    }
    
    appState.replenish.items.push({
        itemId: itemId,
        name: itemName,
        qty: 0
    });
    
    renderReplenishTable();
    document.getElementById('item-search').value = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('search-results').innerHTML = '';
}

// Отображение таблицы привоза
function renderReplenishTable() {
    const tbody = document.getElementById('replenish-table-body');
    tbody.innerHTML = '';
    
    appState.replenish.items.forEach((item, index) => {
        const row = document.createElement('tr');
        // Delete button visibility based on isSaved
        const deleteBtnDisplay = appState.replenish.isSaved ? 'none' : 'inline-block';
        const isNew = (item.itemId === 0 || !item.itemId);
        const nameCell = isNew
            ? `<input type="text" value="${item.name || ''}" oninput="updateReplenishName(${index}, this.value)" ${appState.replenish.isSaved ? 'disabled' : ''} style="text-align: left;">`
            : `${item.name}`;
        
        row.innerHTML = `
            <td ${isNew ? '' : 'class="readonly"'} style="font-size: 14px;">${nameCell}</td>
            <td><input type="number" min="0" value="${item.qty}" onchange="updateReplenishQty(${index}, this.value)" ${appState.replenish.isSaved ? 'disabled' : ''}></td>
            <td><button class="btn btn-delete" style="display: ${deleteBtnDisplay};" onclick="removeReplenishItem(${index})" ${appState.replenish.isSaved ? 'disabled' : ''}>Удалить</button></td>
        `;
        tbody.appendChild(row);
    });
}

function prepareReplenishItemsUI() {
    // Reset state for new replenish session
    appState.replenish.items = [];
    appState.replenish.isSaved = false;
    appState.replenish.replenishId = null;

    // Ensure UI controls are visible/enabled
    const searchBox = document.querySelector('.search-box');
    if (searchBox) searchBox.style.display = 'block';
    const addBtn = document.getElementById('add-replenish-btn');
    if (addBtn) { addBtn.disabled = false; addBtn.style.display = 'inline-block'; }

    const saveBtn = document.getElementById('save-replenish-btn');
    if (saveBtn) saveBtn.style.display = 'block';
    const editBtn = document.getElementById('edit-replenish-btn');
    if (editBtn) editBtn.style.display = 'none';

    const copyBox = document.getElementById('replenish-copy-text');
    if (copyBox) copyBox.style.display = 'none';
    const infoBox = document.getElementById('replenish-info');
    if (infoBox) infoBox.style.display = 'none';

    // Clear table
    const tbody = document.getElementById('replenish-table-body');
    if (tbody) tbody.innerHTML = '';
}

async function checkExistingReplenish() {
    try {
        const { addressId, categoryId, date } = appState.replenish;
        if (!addressId || !categoryId || !date) return;
        const res = await api.getExistingReplenishByDate(addressId, categoryId, date);
        const section = document.getElementById('replenish-existing-section');
        const itemsBox = document.getElementById('existing-items');
        const toggleBtn = document.getElementById('existing-toggle-btn');
        if (!res.exists) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';
        itemsBox.innerHTML = res.items.map(i => `<div>${i.name}: ${i.qty} шт.</div>`).join('');
        itemsBox.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = 'посмотреть';
    } catch (e) {
        // silent fail, do not block user
        console.error('checkExistingReplenish error', e);
    }
}

function toggleExistingReplenish() {
    const itemsBox = document.getElementById('existing-items');
    const toggleBtn = document.getElementById('existing-toggle-btn');
    if (!itemsBox) return;
    const visible = itemsBox.style.display === 'block';
    itemsBox.style.display = visible ? 'none' : 'block';
    if (toggleBtn) toggleBtn.textContent = visible ? 'посмотреть' : 'свернуть';
}

// Обновление количества
function updateReplenishQty(index, value) {
    appState.replenish.items[index].qty = parseInt(value) || 0;
}

function updateReplenishName(index, value) {
    appState.replenish.items[index].name = value;
}

// Удаление позиции
function removeReplenishItem(index) {
    appState.replenish.items.splice(index, 1);
    renderReplenishTable();
}

// Сохранение привоза
async function saveReplenish() {
    if (!appState.replenish.addressId) {
        showNotification('Выберите адрес', 'error');
        return;
    }
    if (!appState.replenish.categoryId) {
        showNotification('Выберите категорию', 'error');
        return;
    }
    
    if (!appState.replenish.date) {
        showNotification('Выберите дату', 'error');
        return;
    }
    
    if (appState.replenish.items.length === 0) {
        showNotification('Добавьте хотя бы одну позицию', 'error');
        return;
    }
    
    const btn = document.getElementById('save-replenish-btn');
    btn.disabled = true;
    
    try {
        const data = {
            addressId: appState.replenish.addressId,
            categoryId: appState.replenish.categoryId,
            date: appState.replenish.date,
            items: appState.replenish.items.map(i => ({
                itemId: i.itemId,
                name: (i.name || '').trim(),
                qty: Number.isFinite(i.qty) ? Math.max(0, i.qty) : 0
            }))
        };
        const hasEmptyNew = appState.replenish.items.some(i => (i.itemId === 0 || !i.itemId) && (!i.name || !i.name.trim()));
        if (hasEmptyNew) {
            showNotification('Введите наименование для новых позиций', 'error');
            btn.disabled = false;
            return;
        }
        
        let result;
        if (appState.replenish.replenishId) {
            result = await api.updateReplenish(appState.replenish.replenishId, data);
        } else {
            result = await api.createReplenish(data);
            appState.replenish.replenishId = result.id;
        }
        
        appState.replenish.isSaved = true;
        
        // Lock inputs and delete buttons
        const inputs = document.querySelectorAll('#replenish-table-body input');
        inputs.forEach(input => input.disabled = true);
        const delBtns = document.querySelectorAll('#replenish-table-body .btn-delete');
        delBtns.forEach(btn => {
            btn.disabled = true;
            btn.style.display = 'none'; // Hide when saved
        });
        
        // Hide Search
        document.querySelector('.search-box').style.display = 'none';
        const addBtn = document.getElementById('add-replenish-btn');
        if (addBtn) {
            addBtn.disabled = true;
            addBtn.style.display = 'none';
        }
        
        // Hide Save button
        document.getElementById('save-replenish-btn').style.display = 'none';

        document.getElementById('replenish-info').style.display = 'block';
        document.getElementById('replenish-id').textContent = result.id;
        document.getElementById('edit-replenish-btn').style.display = 'block';
        
        // Render styled HTML preview
        const content = document.getElementById('replenish-text-content');
        
        // Format date and time
        const now = new Date();
        const timeStr = formatTimeForDisplay(now);
        const dateStr = formatDateForDisplay(new Date(appState.replenish.date));
        
        // Ensure names are available
        if (!appState.replenish.addressName) {
             appState.replenish.addressName = await getAddressNameById(appState.replenish.addressId);
        }
        if (!appState.replenish.categoryName) {
             appState.replenish.categoryName = await getCategoryNameById(appState.replenish.addressId, appState.replenish.categoryId);
        }

        let html = `<div class="order-preview-header">
            <div>ПРИВОЗ</div>
            <div>АДРЕС: ${appState.replenish.addressName.toUpperCase()}</div>
            <div>КАТЕГОРИЯ: ${appState.replenish.categoryName.toUpperCase()}</div>
            <div>ДАТА: ${dateStr}</div>
            <div>ВРЕМЯ: ${timeStr}</div>
        </div>`;
        
        html += `<div class="order-preview-subtitle">ПОЗИЦИИ:</div>`;
        html += `<div class="order-preview-content">`;
        
        appState.replenish.items.forEach(item => {
             html += `<div>${item.name}: ${item.qty} шт.</div>`;
        });
        
        html += `</div>`;
        
        content.innerHTML = html;
        document.getElementById('replenish-copy-text').style.display = 'block';
        
        showNotification('Привоз успешно сохранен!', 'success');
    } catch (error) {
        showNotification('Ошибка сохранения: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

function addNewReplenishItem() {
    if (appState.replenish.isSaved) return;
    appState.replenish.items.push({
        itemId: 0,
        name: '',
        qty: 0
    });
    renderReplenishTable();
    const tbody = document.getElementById('replenish-table-body');
    const lastRowInput = tbody.querySelector('tr:last-child input[type="text"]');
    if (lastRowInput) lastRowInput.focus();
}

// Редактирование привоза
function editReplenish() {
    appState.replenish.isSaved = false;
    
    // Unlock inputs and delete buttons
    const inputs = document.querySelectorAll('#replenish-table-body input');
    inputs.forEach(input => input.disabled = false);
    const delBtns = document.querySelectorAll('#replenish-table-body .btn-delete');
    delBtns.forEach(btn => {
        btn.disabled = false;
        btn.style.display = 'inline-block'; // Show when editing
    });
    
    // Show Search
    document.querySelector('.search-box').style.display = 'block';
    const addBtn = document.getElementById('add-replenish-btn');
    if (addBtn) {
        addBtn.disabled = false;
        addBtn.style.display = 'inline-block';
    }
    
    // Show Save button
    document.getElementById('save-replenish-btn').style.display = 'block';
    
    document.getElementById('edit-replenish-btn').style.display = 'none';
    
    // Hide Copy section
    document.getElementById('replenish-copy-text').style.display = 'none';
    
    renderReplenishTable();
}

// Копирование текста привоза
function copyReplenishText() {
    const text = getTextFromHtmlPreview('replenish-text-content');
    copyToClipboard(text);
}

async function sendReplenishToChannel() {
    if (!appState.replenish.replenishId) {
        showNotification('Сначала сохраните привоз', 'error');
        return;
    }
    const btn = document.getElementById('send-replenish-btn');
    if (btn) btn.disabled = true;
    try {
        const result = await api.sendReplenish(appState.replenish.replenishId);
        if (result && result.sent) {
            showNotification('Отчет отправлен в канал', 'success');
        } else {
            showNotification('Не удалось отправить отчет', 'error');
        }
    } catch (error) {
        showNotification('Ошибка отправки: ' + error.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Выбор адреса для пересчета
async function selectStockAddress(addressId, addressName) {
    appState.stock.addressId = addressId;
    
    try {
        const categories = await api.getCategories(addressId);
        const container = document.getElementById('category-buttons');
        container.innerHTML = '';
        
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = cat.name;
            btn.onclick = () => selectStockCategory(cat.id, cat.name);
            container.appendChild(btn);
        });
        
        document.getElementById('stock-address-selection').classList.remove('active');
        document.getElementById('stock-category-selection').classList.add('active');
    } catch (error) {
        showNotification('Ошибка загрузки категорий: ' + error.message, 'error');
    }
}

// Выбор категории для пересчета
async function selectStockCategory(categoryId, categoryName) {
    appState.stock.categoryId = categoryId;
    
    try {
        const items = await api.getItems(appState.stock.addressId, categoryId);
        appState.stock.items = items.map(item => ({
            itemId: item.id,
            name: item.name,
            qty: 0,
            expected: item.expected,
            sectionId: item.section_id || null,
            sectionName: item.section_name || 'Без раздела'
        }));
        const collapsed = {};
        const sectionsSet = new Set(appState.stock.items.map(i => i.sectionName));
        sectionsSet.forEach(s => { collapsed[s] = true; });
        appState.stock.collapsedSections = collapsed;
        await checkExistingStock();
        renderStockTable();
        
        document.getElementById('stock-category-selection').classList.remove('active');
        document.getElementById('stock-items').classList.add('active');
    } catch (error) {
        showNotification('Ошибка загрузки позиций: ' + error.message, 'error');
    }
}

// Отображение таблицы пересчета
function renderStockTable() {
    const tbody = document.getElementById('stock-table-body');
    tbody.innerHTML = '';
    
    const groups = {};
    appState.stock.items.forEach((item, index) => {
        const key = item.sectionName || 'Без раздела';
        if (!groups[key]) groups[key] = [];
        groups[key].push({ item, index });
    });

    Object.keys(groups).forEach(section => {
        const headerRow = document.createElement('tr');
        headerRow.className = 'section-row';
        const collapsed = !!(appState.stock.collapsedSections && appState.stock.collapsedSections[section]);
        const btnText = collapsed ? 'Развернуть' : 'Свернуть';
        const safeSection = section.replace(/'/g, "\\'");
        headerRow.innerHTML = `
            <td class="section-header-cell"><span>${section}</span></td>
            <td></td>
            <td class="section-header-actions"><button class="section-toggle-btn" onclick="toggleStockSection('${safeSection}')">${btnText}</button></td>
        `;
        tbody.appendChild(headerRow);

        if (collapsed) return;
        groups[section].forEach(({ item, index }) => {
            const row = document.createElement('tr');
            const isNew = (item.itemId === 0 || !item.itemId);
            const nameCell = isNew
                ? `<input type="text" value="${item.name || ''}" oninput="updateStockName(${index}, this.value)" ${appState.stock.isSaved ? 'disabled' : ''} style="text-align: left;">`
                : `${item.name}`;
            row.innerHTML = `
                <td ${isNew ? '' : 'class="readonly"'} style="font-size: 14px;">${nameCell}</td>
                <td><input type="number" min="0" value="${item.qty}" onchange="updateStockQty(${index}, this.value)" ${appState.stock.isSaved ? 'disabled' : ''}></td>
                <td class="readonly" style="text-align: center;">${item.expected}</td>
            `;
            tbody.appendChild(row);
        });
    });
}

function toggleStockSection(sectionName) {
    if (!appState.stock.collapsedSections) appState.stock.collapsedSections = {};
    appState.stock.collapsedSections[sectionName] = !appState.stock.collapsedSections[sectionName];
    renderStockTable();
}

async function checkExistingStock() {
    try {
        const { addressId, categoryId, date } = appState.stock;
        if (!addressId || !categoryId || !date) return;
        appState.stock.reportId = null;
        appState.stock.items.forEach(it => { it.qty = 0; });
        const res = await api.getExistingStockByDate(addressId, categoryId, date);
        if (!res.exists) return;
        appState.stock.reportId = res.reportId;
        const map = new Map(res.items.map(i => [i.item_id, i.qty]));
        appState.stock.items.forEach(it => {
            if (map.has(it.itemId)) it.qty = map.get(it.itemId) || 0;
        });
    } catch (e) {
        console.error('checkExistingStock error', e);
    }
}

// Обновление количества
function updateStockQty(index, value) {
    appState.stock.items[index].qty = parseInt(value) || 0;
}

function updateStockName(index, value) {
    appState.stock.items[index].name = value;
}

// Добавление новой позиции
function addNewItem() {
    appState.stock.items.push({
        itemId: 0,
        name: '',
        qty: 0,
        expected: 0,
        sectionId: null,
        sectionName: 'Без раздела'
    });
    renderStockTable();
    const tbody = document.getElementById('stock-table-body');
    const lastRowInput = tbody.querySelector('tr:last-child input[type="text"]');
    if (lastRowInput) lastRowInput.focus();
}

// Сохранение отчета пересчета
async function saveStockReport() {
    if (!appState.stock.addressId || !appState.stock.categoryId) {
        showNotification('Выберите адрес и категорию', 'error');
        return;
    }
    
    if (!appState.stock.date) {
        showNotification('Выберите дату', 'error');
        return;
    }
    
    const btn = document.getElementById('save-stock-btn');
    btn.disabled = true;
    
    try {
        const data = {
            addressId: appState.stock.addressId,
            categoryId: appState.stock.categoryId,
            date: appState.stock.date,
            items: appState.stock.items
        };
        const hasEmptyNew = appState.stock.items.some(i => (i.itemId === 0 || !i.itemId) && (!i.name || !i.name.trim()));
        if (hasEmptyNew) {
            showNotification('Введите наименование для новых позиций', 'error');
            btn.disabled = false;
            return;
        }
        
        let result;
        if (appState.stock.reportId) {
            result = await api.updateStockReport(appState.stock.reportId, data);
        } else {
            result = await api.createStockReport(data);
            appState.stock.reportId = result.id;
        }
        
        appState.stock.isSaved = true;
        
        // Блокируем таблицу и кнопки
        const inputs = document.querySelectorAll('#stock-table-body input');
        inputs.forEach(input => input.disabled = true);
        
        // Скрываем кнопку добавления
        const addBtn = document.querySelector('.section-header-row .btn-outline-small');
        if (addBtn) addBtn.style.display = 'none';

        // Hide Save button
        document.getElementById('save-stock-btn').style.display = 'none';

        document.getElementById('stock-report-info').style.display = 'block';
        document.getElementById('stock-report-id').textContent = result.id;
        document.getElementById('edit-stock-btn').style.display = 'block';
        document.getElementById('generate-order-btn').style.display = 'block';
        
        showNotification('Отчет успешно сохранен!', 'success');
    } catch (error) {
        showNotification('Ошибка сохранения: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// Редактирование отчета
function editStockReport() {
    appState.stock.isSaved = false;
    
    // Разблокируем таблицу
    const inputs = document.querySelectorAll('#stock-table-body input');
    inputs.forEach(input => input.disabled = false);
    
    // Показываем кнопку добавления
    const addBtn = document.querySelector('.section-header-row .btn-outline-small');
    if (addBtn) addBtn.style.display = 'block';

    document.getElementById('edit-stock-btn').style.display = 'none';
    document.getElementById('generate-order-btn').style.display = 'none';
    
    // Show Save button again
    document.getElementById('save-stock-btn').style.display = 'block';
    
    // Disable/Hide Copy button if it was visible
    document.getElementById('order-result').style.display = 'none';
    // Or if we want to just disable the copy button inside it:
    // document.getElementById('copy-order-btn').disabled = true;
    
    renderStockTable();
}

// Генерация заказа
async function generateOrder() {
    if (!appState.stock.reportId) {
        showNotification('Сначала сохраните отчет', 'error');
        return;
    }
    
    try {
        const order = await api.generateOrder(appState.stock.reportId);
        displayOrder(order);
    } catch (error) {
        showNotification('Ошибка генерации заказа: ' + error.message, 'error');
    }
}

// Отображение заказа
function displayOrder(order) {
    const content = document.getElementById('order-content');
    
    const now = new Date();
    const timeStr = formatTimeForDisplay(now);
    const dateStr = formatDateForDisplay(new Date(order.date));

    let html = `<div class="order-preview-header">
        <div>ЗАКАЗ ДЛЯ ${order.addressName.toUpperCase()}</div>
        <div>РАЗДЕЛ: ${order.categoryName.toUpperCase()}</div>
        <div>ДАТА: ${dateStr}</div>
        <div>ВРЕМЯ: ${timeStr}</div>
    </div>`;
    
    html += `<div class="order-preview-subtitle">НЕОБХОДИМО ЗАКАЗАТЬ:</div>`;
    
    html += `<div class="order-preview-content">`;
    order.items.forEach(item => {
        html += `<div>${item.name}: ${item.needed} шт. (есть: ${item.current}, нужно: ${item.expected})</div>`;
    });
    html += `</div>`;
    
    content.innerHTML = html;
    document.getElementById('order-result').style.display = 'block';
}

// Копирование заказа
function copyOrder() {
    const text = getTextFromHtmlPreview('order-content');
    copyToClipboard(text);
}

async function sendOrderToChannel() {
    if (!appState.stock.reportId) {
        showNotification('Сначала сохраните отчет', 'error');
        return;
    }
    const btn = document.getElementById('send-order-btn');
    if (btn) btn.disabled = true;
    try {
        const result = await api.sendOrder(appState.stock.reportId);
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

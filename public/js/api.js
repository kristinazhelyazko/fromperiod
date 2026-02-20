// API клиент для работы с backend
// В Telegram Web App используем относительный путь
const API_BASE_URL = window.location.origin + '/api';

async function apiRequest(endpoint, options = {}) {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

const api = {
    // Адреса
    getAddresses: () => apiRequest('/addresses'),

    // Категории
    getCategories: (addressId) => apiRequest(`/categories/${addressId}`),

    // Разделы
    getSections: (addressId, categoryId) => apiRequest(`/sections/${addressId}/${categoryId}`),

    // Позиции
    getItems: (addressId, categoryId) => apiRequest(`/items/${addressId}/${categoryId}`),
    searchItems: (addressId, categoryId, query) => apiRequest(`/items/search/${addressId}/${categoryId}?query=${encodeURIComponent(query)}`),

    // Пересчет
    createStockReport: (data) => apiRequest('/stock/create-report', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateStockReport: (reportId, data) => apiRequest(`/stock/update-report/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getStockReport: (reportId) => apiRequest(`/stock/report/${reportId}`),
    generateOrder: (reportId) => apiRequest(`/stock/generate-order/${reportId}`, {
        method: 'POST'
    }),
    getOrder: (reportId) => apiRequest(`/stock/order/${reportId}`),
    sendOrder: (reportId) => apiRequest(`/stock/send-order/${reportId}`, { method: 'POST' }),

    // Привоз
    createReplenish: (data) => apiRequest('/replenish/create', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    updateReplenish: (replenishId, data) => apiRequest(`/replenish/update/${replenishId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    getReplenish: (replenishId) => apiRequest(`/replenish/${replenishId}`),
    getReplenishCopyText: (replenishId) => apiRequest(`/replenish/copy-text/${replenishId}`),
    getExistingReplenishByDate: (addressId, categoryId, date) => apiRequest(`/replenish/existing?addressId=${addressId}&categoryId=${categoryId}&date=${encodeURIComponent(date)}`),
    sendReplenish: (replenishId) => apiRequest(`/replenish/send/${replenishId}`, { method: 'POST' })

    ,
    getExistingStockByDate: (addressId, categoryId, date) => apiRequest(`/stock/existing?addressId=${addressId}&categoryId=${categoryId}&date=${encodeURIComponent(date)}`)
};

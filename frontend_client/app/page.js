"use client";

import Script from "next/script";

export default function StorePage() {
  return (
    <>
      <Script src="/js/api.js" strategy="beforeInteractive" />
      <Script src="/js/store.js" strategy="afterInteractive" />

      <div id="app">
        <div id="store-notification" className="notification">
          Ваша корзина еще пуста. Добавьте позиции.
        </div>

        <div id="store-main-screen" className="screen active">
          <div className="logo-container">
            <img src="/period.png" alt="P Logo" className="logo-icon" />
            <img
              src="/full_logo.png"
              alt="PERIOD"
              className="logo-text"
              style={{ marginBottom: "15px" }}
            />
          </div>
          <p
            className="center-title"
            style={{ marginBottom: "20px", fontSize: "22px", lineHeight: 1.35 }}
          >
            Для того, чтобы создать заказ, выберите населенный пункт:
          </p>
          <div id="store-address-buttons" className="button-group"></div>
        </div>

        <div id="catalog-screen" className="screen">
          <div className="catalog-top-row">
            <button
              className="btn btn-back catalog-back-button"
              onClick={() =>
                window.goBackToStoreMain && window.goBackToStoreMain()
              }
            >
              <img src="/back.png" alt="Назад" className="catalog-back-icon" />
            </button>
            <img src="/logo.png" alt="PERIOD" className="catalog-logo" />
            <button
              className="cart-button"
              onClick={() => window.openCart && window.openCart()}
            >
              <img
                src="/pocket.png"
                alt="Корзина"
                style={{ width: "20px", height: "20px" }}
              />
            </button>
          </div>
          <div className="catalog-divider"></div>
          <div className="catalog-title-row">
            <h2 id="catalog-title" className="catalog-title">
              Каталог
            </h2>
            <div className="catalog-address-chip" id="catalog-address-label"></div>
          </div>
          <div id="catalog-list" className="catalog-list"></div>
        </div>

        <div id="cart-screen" className="screen">
          <div className="catalog-top-row">
            <button
              className="btn btn-back catalog-back-button"
              onClick={() => window.goBackToCatalog && window.goBackToCatalog()}
            >
              <img src="/back.png" alt="Назад" className="catalog-back-icon" />
            </button>
            <img src="/logo.png" alt="PERIOD" className="catalog-logo" />
            <div></div>
          </div>
          <div className="catalog-divider"></div>
          <div className="cart-title-row">
            <h2 className="cart-title">Корзина</h2>
          </div>
          <div id="cart-list" className="cart-list"></div>
          <div className="cart-summary">
            <span className="cart-summary-label">Итого:</span>
            <span className="cart-summary-value" id="cart-total-value">
              0 ₽
            </span>
          </div>
          <button
            className="btn btn-primary cart-submit-btn"
            onClick={() => window.goToCheckout && window.goToCheckout()}
          >
            Оформить заказ
          </button>
        </div>

        <div id="checkout-screen" className="screen">
          <div className="catalog-top-row">
            <button
              className="btn btn-back catalog-back-button"
              onClick={() => window.goBackToCart && window.goBackToCart()}
            >
              <img src="/back.png" alt="Назад" className="catalog-back-icon" />
            </button>
            <img src="/logo.png" alt="PERIOD" className="catalog-logo" />
            <div></div>
          </div>
          <div className="catalog-divider"></div>
          <div className="checkout-title-row">
            <h2 className="checkout-title">Оформление заказа</h2>
          </div>
          <div className="checkout-form">
            <input
              id="checkout-client-name"
              className="checkout-input"
              type="text"
              placeholder="Введите свое ФИО *"
            />
            <input
              id="checkout-client-telegram"
              className="checkout-input"
              type="text"
              placeholder="Введите ваш ник в Telegram"
            />
            <input
              id="checkout-client-phone"
              className="checkout-input phone-input"
              type="tel"
              placeholder="Введите ваш номер телефона *"
            />
            <div className="checkout-divider"></div>
            <div id="checkout-items"></div>
            <label className="checkout-checkbox consent-checkbox">
              <input type="checkbox" id="consent-checkbox" />
              <span>
                Даю{" "}
                <span
                  className="consent-link"
                  onClick={() =>
                    window.openConsentScreen && window.openConsentScreen()
                  }
                >
                  согласие на обработку персональных данных
                </span>
                <span className="required-star">*</span>
              </span>
            </label>
            <button
              className="btn btn-primary checkout-submit-btn"
              type="button"
              onClick={() => window.submitCheckout && window.submitCheckout()}
            >
              Отправить заказ
            </button>
          </div>
        </div>

        <div id="consent-screen" className="screen">
          <div className="catalog-top-row">
            <button
              className="btn btn-back catalog-back-button"
              onClick={() =>
                window.goBackFromConsent && window.goBackFromConsent()
              }
            >
              <img src="/back.png" alt="Назад" className="catalog-back-icon" />
            </button>
            <img src="/logo.png" alt="PERIOD" className="catalog-logo" />
            <div></div>
          </div>
          <div className="catalog-divider"></div>
          <div className="consent-content" id="consent-content"></div>
        </div>

        <div id="checkout-success-screen" className="screen">
          <div className="catalog-top-row">
            <button
              className="btn btn-back catalog-back-button"
              onClick={() =>
                window.goBackToStoreMain && window.goBackToStoreMain()
              }
            >
              <img src="/home.png" alt="Главное меню" className="catalog-back-icon" />
            </button>
            <img src="/logo.png" alt="PERIOD" className="catalog-logo" />
            <div></div>
          </div>
          <div className="catalog-divider"></div>
          <div className="checkout-success">
            <p className="checkout-success-main">Ваш заказ № отправлен!</p>
            <p className="checkout-success-sub">
              Наш менеджер свяжется в ближайшее время для уточнения заказа.
            </p>
          </div>
        </div>

        <div
          id="order-confirm-overlay"
          className="modal-overlay"
          style={{ display: "none" }}
        >
          <div className="modal-box">
            <div className="modal-message">
              Проверьте корректность введенных данных:
            </div>
            <div id="order-confirm-content" className="order-confirm-content"></div>
            <div className="modal-actions">
              <button
                className="btn"
                type="button"
                onClick={() => window.editCheckout && window.editCheckout()}
              >
                Внести изменение
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  window.confirmCheckout && window.confirmCheckout()
                }
              >
                Всё верно
              </button>
            </div>
          </div>
        </div>

        <div
          id="store-loading-overlay"
          className="modal-overlay"
          style={{ display: "none" }}
        >
          <div className="modal-box">
            <div className="store-spinner"></div>
            <div className="modal-message">
              Отправляем заказ, пожалуйста подождите...
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


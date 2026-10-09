# Page Code Directory

UI code for different pages is located in `pages/`. When making modifications, open the corresponding route file.

| Page | Route | File |
|---|---|---|
| User dashboard | `/dashboard` | `user-dashboard.js` |
| User general placeholder pages | Other routes in User menu | Individual `.html` files in `user/`; renderer `user-placeholder.js` |
| Wallet topup request | `/fund/wallet-topup-request` | `user-wallet-topup.js` |
| My Fund Order | `/report/fund-order` | `user-fund-order.js` |
| Seller Margin | `/seller/sales-margin` | `user-sales-margin.js` |
| Buyer Margin | `/buyer/margin` | `user-buyer-margin.js` |
| Admin fund request | `/admin/payment/fund-request` | `admin-fund-requests.js` |
| Admin operator form | `/admin/settings/create-operator` | `admin-create-operator.js` |
| Admin operator list | `/admin/settings/show-operator` | `admin-show-operators.js` |
| Existing Admin UI files and assets | `/admin/...`, `/assets/...` | `admin-static-ui.js` |
| Admin user list | `/admin/users/list` | `admin-user-list.js` and `admin-user-list-client.js` |

For example, the HTML for `/buyer/margin` is located in `user/buyer-margin.html`. Shared navigation is configured in `config/user-panel-menu.js` and HTML helpers are in `lib/page-utils.js`. Application routes, authentication, database, and API wiring reside in `index.js`.

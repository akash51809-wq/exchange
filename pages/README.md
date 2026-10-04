# पेज कोड सूची

अलग-अलग पेज का UI कोड `pages/` में है। बदलाव करते समय संबंधित route की फ़ाइल खोलें।

| पेज | route | फ़ाइल |
|---|---|---|
| User dashboard | `/dashboard` | `user-dashboard.js` |
| User के सामान्य placeholder pages | User menu में बाक़ी routes | `user/` में हर page की अलग `.html` फ़ाइल; renderer `user-placeholder.js` |
| Wallet topup request | `/fund/wallet-topup-request` | `user-wallet-topup.js` |
| My Fund Order | `/report/fund-order` | `user-fund-order.js` |
| Seller Margin | `/seller/sales-margin` | `user-sales-margin.js` |
| Buyer Margin | `/buyer/margin` | `user-buyer-margin.js` |
| Admin fund request | `/admin/payment/fund-request` | `admin-fund-requests.js` |
| Admin operator form | `/admin/settings/create-operator` | `admin-create-operator.js` |
| Admin operator list | `/admin/settings/show-operator` | `admin-show-operators.js` |
| मौजूदा Admin UI की फ़ाइलें और assets | `/admin/...`, `/assets/...` | `admin-static-ui.js` |

उदाहरण के लिए `/buyer/margin` का HTML `user/buyer-margin.html` में है। साझा navigation `config/user-panel-menu.js` में और HTML helpers `lib/page-utils.js` में हैं। `index.js` में route, authentication, database और API wiring रहती है।

| Admin user list | `/admin/users/list` | `admin-user-list.js` and `admin-user-list-client.js` |

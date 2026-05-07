import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // 確保您的主程式碼存為 App.jsx
import './index.css'        // 引入包含 @tailwind 指令的 CSS

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
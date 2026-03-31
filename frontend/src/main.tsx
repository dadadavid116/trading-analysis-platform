import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Mount the React application into the #root div defined in index.html
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

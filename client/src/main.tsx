import React from 'react';
import ReactDOM from 'react-dom/client';
import ReactFlow from 'reactflow';
import 'reactflow/dist/style.css';
import App from './App';
import './styles.css';

ReactFlow; // 确保样式与包被打入
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

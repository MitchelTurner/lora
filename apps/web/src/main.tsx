import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function App() {
  return <h1 className="p-8 text-2xl font-bold">LoRA Forge</h1>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

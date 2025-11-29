import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Titlebar from '@/layout/Titlebar';

import Home from '@/routes/Home';

function App() {
  return (
    <>
      <Titlebar />
      <Router>
        <main className="screen center col overflow-y-auto">
          <Routes>
            {/* Main pages */}
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
      </Router>
    </>
  );
}

export default App;

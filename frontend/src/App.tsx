import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Session from "./pages/Session";

export default function App() {
  return (
    <>
      <nav className="navbar">
        <div className="page-wrapper">
          <div className="navbar-inner">
            <Link to="/" className="navbar-brand">
              <span className="icon">🔭</span>
              Research Scout
            </Link>
          </div>
        </div>
      </nav>

      <main className="page-wrapper">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </main>
    </>
  );
}

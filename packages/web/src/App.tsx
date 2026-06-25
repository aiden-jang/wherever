import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import Landing from "./routes/Landing.js";
import Lobby from "./routes/Lobby.js";

export default function App() {
  return (
    <BrowserRouter>
      <div className="grain min-h-full flex flex-col">
        <div className="aurora" aria-hidden />

        <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
          <Link to="/" className="font-display text-lg font-extrabold tracking-tight">
            Wherever<span className="text-ember">,</span> Honestly
          </Link>
          <span className="hidden sm:inline-block rounded-full border border-white/15 px-3 py-1 text-xs text-muted">
            no group chat. ever.
          </span>
        </header>

        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/s/:code" element={<Lobby />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

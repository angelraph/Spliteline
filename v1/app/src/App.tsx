import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Create } from "./pages/Create";
import { SplitView } from "./pages/SplitView";
import { Claim } from "./pages/Claim";
import { Proof } from "./pages/Proof";
import { Docs } from "./pages/Docs";
import { Faq } from "./pages/Faq";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<Create />} />
        <Route path="/s/:id" element={<SplitView />} />
        <Route path="/claim" element={<Claim />} />
        <Route path="/proof" element={<Proof />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/faq" element={<Faq />} />
      </Route>
    </Routes>
  );
}

export default App;

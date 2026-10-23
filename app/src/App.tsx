import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Create } from "./pages/Create";
import { SplitView } from "./pages/SplitView";
import { Claim } from "./pages/Claim";
import { Proof } from "./pages/Proof";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Create />} />
        <Route path="/s/:id" element={<SplitView />} />
        <Route path="/claim" element={<Claim />} />
        <Route path="/proof" element={<Proof />} />
      </Route>
    </Routes>
  );
}

export default App;

import { createRoot } from "react-dom/client";
import { Visualiser } from "./visualiser";

const mountNode = document.getElementById("app");
if (!mountNode) {
  throw new Error("Missing #app element");
}

createRoot(mountNode).render(<App />);

function App() {
  return (
    <Visualiser />
  )
}
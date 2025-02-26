import RoutesObj from "./routes";
import { BrowserRouter as Router } from "react-router-dom";
import WebApp from "@twa-dev/sdk"
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    WebApp.ready();
  }, []);

  return (
    <Router>
      <RoutesObj/>
    </Router>
  )
}

export default App;
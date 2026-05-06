import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const ThemeSwitcher = () => {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("lunex-theme");
    if (saved === "light") {
      setDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("lunex-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("lunex-theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground transition-colors p-1"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

export default ThemeSwitcher;

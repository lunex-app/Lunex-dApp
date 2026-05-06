import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground text-sm tracking-wider uppercase mb-8">Page not found</p>
        <Link
          to="/"
          className="inline-flex items-center bg-primary text-primary-foreground px-6 py-3 text-xs font-semibold tracking-wider uppercase hover:bg-primary/90 transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;

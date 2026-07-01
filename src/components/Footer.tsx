import { Link } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";

const FooterInner = () => {
  const { isAdmin, isDeveloper } = useAuth();

  if (!isAdmin && !isDeveloper) return null;

  return (
    <footer className="border-t border-border bg-background py-4">
      <div className="container flex items-center justify-center text-xs text-muted-foreground tracking-wider">
        {(isAdmin || isDeveloper) && (
          <Link to="/lunexsdk" className="hover:text-foreground transition-colors uppercase">
            SDK Portal
          </Link>
        )}
      </div>
    </footer>
  );
};

const Footer = () => (
  <AuthProvider>
    <FooterInner />
  </AuthProvider>
);

export default Footer;

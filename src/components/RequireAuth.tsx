import { useEffect, useState, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../firebase/auth';

const RequireAuth = ({ children }: { children: ReactElement }) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = useAuth((user) => {
      setCurrentUser(user);
      if (!user) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (!currentUser) {
    return null;
  }

  return children;
};

export default RequireAuth; 
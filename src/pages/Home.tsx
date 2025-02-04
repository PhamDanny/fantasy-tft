import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../firebase/auth';
import { Trophy, Crown } from 'lucide-react';

const Home = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = useAuth((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="container-fluid p-0">
      {/* Hero Section */}
      <div className="bg-primary bg-gradient text-white py-5 px-4 mb-5">
        <div className="row align-items-center">
          <div className="col-lg-6">
            <h1 className="display-4 fw-bold mb-3">Fantasy TFT</h1>
            <p className="lead mb-4">
              Create leagues, draft players, and compete with friends in the ultimate
              TFT fantasy experience. Track scores across multiple tournaments and crown
              your league's champion!
            </p>
            {!currentUser && (
              <div>
                <Link to="/login?mode=signup" className="btn btn-light btn-lg px-4 me-3">
                  Sign Up
                </Link>
                <Link to="/login" className="btn btn-outline-light btn-lg px-4">
                  Log In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Cards Section */}
      <div className="container mb-5">
        <div className="row g-4 justify-content-center">
          <div className="col-md-6 col-lg-5">
            <div className="card h-100">
              <div className="card-body d-flex flex-column">
                <div className="d-flex align-items-center mb-3">
                  <Trophy className="text-primary me-2" size={24} />
                  <h3 className="h5 mb-0">Fantasy Leagues</h3>
                </div>
                <p className="card-text">
                  Create a league, invite friends, and draft your favorite TFT competitors. Compete over
                  multiple tournaments and track your standings throughout the season.
                </p>
                <div className="mt-auto text-center">
                  <Link to="/leagues" className="btn btn-primary">
                    Browse Leagues
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-6 col-lg-5">
            <div className="card h-100">
              <div className="card-body d-flex flex-column">
                <div className="d-flex align-items-center mb-3">
                  <Crown className="text-warning me-2" size={24} />
                  <h3 className="h5 mb-0">Perfect Roster Challenge</h3>
                </div>
                <p className="card-text">
                  Don't want to commit to a full league? Try the Perfect Roster Challenge! 
                  Pick your ideal lineup for a single tournament and compete against everyone to score the most points.
                  Can you pick the perfect roster? 
                </p>
                <div className="mt-auto text-center">
                  <Link to="/perfect-roster" className="btn btn-warning text-dark">
                    Join Challenge
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-light py-5">
        <div className="container">
          <h2 className="text-center mb-4">How It Works</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="text-center">
                <div className="d-flex justify-content-center">
                  <div className="badge bg-primary rounded-circle p-3 mb-3 d-flex align-items-center justify-content-center" 
                       style={{ width: '45px', height: '45px', fontSize: '1.2rem' }}>
                    1
                  </div>
                </div>
                <h3 className="h5">Draft Your Teams</h3>
                <p className="text-muted">
                  You can draft your teams live right here on Fantasy TFT in the Drafts tab, or you can draft on your own platform and import your rosters later.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="text-center">
                <div className="d-flex justify-content-center">
                  <div className="badge bg-primary rounded-circle p-3 mb-3 d-flex align-items-center justify-content-center" 
                       style={{ width: '45px', height: '45px', fontSize: '1.2rem' }}>
                    2
                  </div>
                </div>
                <h3 className="h5">Create Your League</h3>
                <p className="text-muted">
                  Convert your Fantasy TFT Draft directly into a League, or create a new one from scratch and import your rosters later.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="text-center">
                <div className="d-flex justify-content-center">
                  <div className="badge bg-primary rounded-circle p-3 mb-3 d-flex align-items-center justify-content-center" 
                       style={{ width: '45px', height: '45px', fontSize: '1.2rem' }}>
                    3
                  </div>
                </div>
                <h3 className="h5">Compete & Win</h3>
                <p className="text-muted">
                  Manage your roster through trades and Free Agents. Compete for the highest season score, 
                  or battle it out in playoffs during the Americas Golden Spatula!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;

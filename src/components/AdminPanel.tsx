import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { PerfectRosterChallenge } from '../types';
import { Plus, Minus } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface AdminPanelProps {
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterSettings, setRosterSettings] = useState({
    captainSlots: 1,
    naSlots: 5,
    brLatamSlots: 1,
    flexSlots: 3
  });
  const [isAdminOnly, setIsAdminOnly] = useState(false);

  const updateSlotCount = (
    slotType: keyof typeof rosterSettings,
    increment: boolean
  ) => {
    setRosterSettings(prev => ({
      ...prev,
      [slotType]: Math.max(0, prev[slotType] + (increment ? 1 : -1))
    }));
  };

  const createChallenge = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;
    const season = formData.get('season') as string;
    const set = parseInt(formData.get('set') as string);
    const currentCup = formData.get('currentCup') as string;
    const rosterLockLocal = formData.get('rosterLock') as string;

    try {
      // Create date from the local input, maintaining the timezone
      const rosterLockDate = new Date(rosterLockLocal);

      const challenge: PerfectRosterChallenge = {
        id: `${name.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}`,
        name,
        season,
        set,
        currentCup,
        startDate: Timestamp.fromDate(new Date()),
        endDate: Timestamp.fromDate(rosterLockDate),
        status: 'active',
        settings: rosterSettings,
        entries: {},
        adminOnly: isAdminOnly
      };

      await setDoc(doc(db, 'perfectRosterChallenges', challenge.id), challenge);
      onClose();
    } catch (err) {
      console.error('Date error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    } finally {
      setLoading(false);
    }
  };

  const renderSlotSetting = (
    label: string,
    slotType: keyof typeof rosterSettings
  ) => (
    <div className="d-flex align-items-center justify-content-between mb-3">
      <label className="form-label mb-0">{label}</label>
      <div className="input-group" style={{ width: 'auto' }}>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => updateSlotCount(slotType, false)}
        >
          <Minus size={16} />
        </button>
        <span className="input-group-text" style={{ minWidth: '40px' }}>
          {rosterSettings[slotType]}
        </span>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => updateSlotCount(slotType, true)}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );

  // Get current Pacific time for min datetime
  const getPacificDateTime = () => {
    const now = new Date();
    return new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);
  };

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Admin Panel</h5>
        <button className="btn-close" onClick={onClose}></button>
      </div>
      <div className="card-body">
        <h6>Create New Challenge</h6>
        <form onSubmit={createChallenge}>
          <div className="mb-3">
            <label className="form-label">Challenge Name</label>
            <input
              type="text"
              name="name"
              className="form-control"
              required
              placeholder="e.g., Cup 1 Challenge"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Season</label>
            <input
              type="text"
              name="season"
              className="form-control"
              required
              placeholder="e.g., Set 13"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Set</label>
            <input
              type="number"
              name="set"
              className="form-control"
              required
              min="1"
              defaultValue="13"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Current Cup</label>
            <input
              type="text"
              name="currentCup"
              className="form-control"
              required
              placeholder="e.g., cup1"
            />
          </div>

          <div className="card mb-3">
            <div className="card-header">
              <h6 className="mb-0">Roster Settings</h6>
            </div>
            <div className="card-body">
              {renderSlotSetting('Captain Slots', 'captainSlots')}
              {renderSlotSetting('NA Player Slots', 'naSlots')}
              {renderSlotSetting('BR/LATAM Slots', 'brLatamSlots')}
              {renderSlotSetting('Flex Slots', 'flexSlots')}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Roster Lock Time (Pacific Time)</label>
            <input
              type="datetime-local"
              name="rosterLock"
              className="form-control"
              required
              min={getPacificDateTime()}
            />
            <small className="text-muted">
              All times are in Pacific Time (PT)
            </small>
          </div>

          <div className="form-check mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="adminOnly"
              checked={isAdminOnly}
              onChange={(e) => setIsAdminOnly(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="adminOnly">
              Admin Only Challenge
            </label>
            <small className="form-text text-muted d-block">
              Only admin users will be able to see this challenge
            </small>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Challenge'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminPanel; 
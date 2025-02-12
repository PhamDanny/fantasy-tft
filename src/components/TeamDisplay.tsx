import React from 'react';
import type { Team } from '../types';

interface TeamDisplayProps {
  team: Team | null | undefined;
  className?: string;
}

const TeamDisplay: React.FC<TeamDisplayProps> = ({ team, className = '' }) => {
  if (!team) return <span className={className}>Unknown Team</span>;
  
  return (
    <span className={className}>
      {team.teamName}
      {team.teamName !== team.ownerDisplayName && (
        <small className="text-muted ms-2">
          ({team.ownerDisplayName})
        </small>
      )}
    </span>
  );
};

export default TeamDisplay; 
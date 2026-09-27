import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ExperienceMemoryView } from './ExperienceMemoryView';
import { Application, ExperienceMemoryEntry } from '../types/automation';

export const ExperiencesPage: React.FC = () => {
  const [experience, setExperience] = useState<ExperienceMemoryEntry[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const load = async () => {
    const [exp, apps] = await Promise.all([api.getExperience(), api.getApplications()]);
    setExperience(exp || []);
    setApplications(apps || []);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="p-6 overflow-y-auto h-full bg-slate-100 text-slate-900">
      <ExperienceMemoryView
        experience={experience}
        applications={applications}
        onToggleEnabled={async (id, current) => {
          await api.updateExperience(id, { isEnabled: !current });
          await load();
        }}
        onDeleteExperience={async (id) => {
          await api.deleteExperience(id);
          await load();
        }}
        onAddExperience={async (entry) => {
          await api.createExperience(entry);
          await load();
        }}
      />
    </div>
  );
};

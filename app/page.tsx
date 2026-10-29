'use client';

import { useState } from 'react';
import HardwareLab from '@/components/hardware-lab';
import BuildMode from '@/components/build-mode';
import CompatibilityChecker from '@/components/compatibility-checker';
import BudgetPlanner from '@/components/budget-planner';
import type { Mode } from '@/components/app-header';

export default function Home() {
  const [mode, setMode] = useState<Mode>('explore');

  if (mode === 'build') {
    return <BuildMode onModeChange={setMode} />;
  }

  if (mode === 'compatibility') {
    return <CompatibilityChecker onModeChange={setMode} />;
  }

  if (mode === 'planner') {
    return <BudgetPlanner onModeChange={setMode} />;
  }

  return <HardwareLab onModeChange={setMode} />;
}

'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { OverviewCards } from '@/components/dashboard/OverviewCards';
import { TokenTable } from '@/components/dashboard/TokenTable';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { PortfolioChart } from '@/components/dashboard/charts/PortfolioChart';
import { AllocationPie } from '@/components/dashboard/charts/AllocationPie';
import { WalletDetail } from '@/components/wallet/WalletDetail';
import { RpcBanner } from '@/components/layout/RpcBanner';

export default function Home() {
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('overview');

  const handleSelectWallet = (id: number | null) => {
    setSelectedWalletId(id);
    if (id !== null) {
      setActiveView('overview');
      setSelectedGroupId(null);
    }
  };

  const handleSelectGroup = (id: number | null) => {
    setSelectedGroupId(id);
    setSelectedWalletId(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        selectedWalletId={selectedWalletId}
        onSelectWallet={handleSelectWallet}
        selectedGroupId={selectedGroupId}
        onSelectGroup={handleSelectGroup}
        activeView={activeView}
        onChangeView={setActiveView}
      />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <RpcBanner />
        <div className="max-w-7xl mx-auto p-6 space-y-6">

          {/* Per-wallet drilldown */}
          {selectedWalletId !== null ? (
            <WalletDetail
              walletId={selectedWalletId}
              onBack={() => setSelectedWalletId(null)}
            />
          ) : (
            <>
              {/* Overview tab */}
              {activeView === 'overview' && (
                <>
                  <OverviewCards groupId={selectedGroupId} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <PortfolioChart groupId={selectedGroupId} />
                    </div>
                    <AllocationPie groupId={selectedGroupId} />
                  </div>
                </>
              )}

              {/* Holdings tab */}
              {activeView === 'tokens' && (
                <>
                  <OverviewCards groupId={selectedGroupId} />
                  <TokenTable groupId={selectedGroupId} />
                </>
              )}

              {/* Activity tab */}
              {activeView === 'activity' && (
                <>
                  <OverviewCards groupId={selectedGroupId} />
                  <ActivityFeed groupId={selectedGroupId} />
                </>
              )}

            </>
          )}
        </div>
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '@/lib/ipc';
import { GlassCard } from '@/components/UI/GlassCard';
import { RefreshIcon } from '@/components/UI/icons';

function SparklesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5Z" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
    </svg>
  );
}

function ArrowDownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

export function UpdateNotification() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloaded'>('idle');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    // Query cached status on mount to resolve background/hidden startup race conditions
    api.app.getUpdateStatus()
      .then((res) => {
        if (res && res.status !== 'idle') {
          setVersion(res.version);
          setStatus(res.status);
        }
      })
      .catch(() => undefined);

    const unsubAvailable = api.app.onUpdateAvailable((ver) => {
      setVersion(ver);
      setStatus('available');
    });

    const unsubDownloaded = api.app.onUpdateDownloaded((ver) => {
      setVersion(ver);
      setStatus('downloaded');
    });

    return () => {
      unsubAvailable();
      unsubDownloaded();
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-slide-in">
      <GlassCard
        className="flex flex-col gap-4 p-5 rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] transition-all duration-300"
        style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(28, 28, 32, 0.82)',
          backdropFilter: 'blur(28px) saturate(190%)',
        }}
      >
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors"
            style={{
              background:
                status === 'downloaded'
                  ? 'rgba(46, 206, 113, 0.12)'
                  : 'rgba(52, 152, 219, 0.12)',
              color: status === 'downloaded' ? '#2ece71' : '#3498db',
              border: status === 'downloaded'
                ? '1px solid rgba(46, 206, 113, 0.18)'
                : '1px solid rgba(52, 152, 219, 0.18)',
            }}
          >
            {status === 'downloaded' ? <SparklesIcon size={18} /> : <ArrowDownIcon size={18} />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h4 className="text-sm font-semibold tracking-tight text-white leading-tight">
              {status === 'downloaded' ? 'Software Update Ready' : 'Downloading Update'}
            </h4>
            <p className="text-[12px] text-[#8e8e93] leading-snug mt-1 font-medium">
              {status === 'downloaded'
                ? `Version v${version} has been successfully downloaded and is ready to install.`
                : `Version v${version} is currently downloading in the background.`}
            </p>
          </div>
        </div>

        {status === 'downloaded' && (
          <div className="flex gap-2.5 justify-end mt-1.5 border-t border-[rgba(255,255,255,0.06)] pt-3">
            <button
              className="px-4 py-2 text-xs font-semibold text-[#8e8e93] hover:text-white transition-colors duration-150 rounded-lg hover:bg-[rgba(255,255,255,0.04)]"
              onClick={() => setStatus('idle')}
            >
              Later
            </button>
            <button
              className="px-4 py-2 text-xs font-semibold text-white bg-[#007aff] hover:bg-[#0062cc] active:bg-[#004b9b] transition-all duration-150 rounded-lg flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,122,255,0.25)] hover:shadow-[0_4px_12px_rgba(0,122,255,0.4)]"
              onClick={() => void api.app.quitAndInstall()}
            >
              <RefreshIcon size={12} />
              Restart & Update
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Library } from './components/Library';
import { Reader } from './components/reader/Reader';
import { useApplyTheme } from './lib/storage/prefs';

type Route = { name: 'library' } | { name: 'read'; id: string };

function parseHash(): Route {
  const m = location.hash.match(/^#\/read\/([\w-]+)/);
  return m ? { name: 'read', id: m[1] } : { name: 'library' };
}

export default function App() {
  useApplyTheme();
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.name === 'read') {
    return <Reader key={route.id} bookId={route.id} onExit={() => (location.hash = '#/')} />;
  }
  return <Library onOpen={(id) => (location.hash = `#/read/${id}`)} />;
}

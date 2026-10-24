import React from 'react';
import { Dashboard } from './Dashboard';
import { NewLora } from './NewLora';
import { ProjectView } from './ProjectView';
import { Shell } from './ui';

function parse(path: string): { name: 'home' } | { name: 'new' } | { name: 'project'; id: string } {
  if (path === '/new') return { name: 'new' };
  const match = path.match(/^\/projects\/([^/]+)$/);
  if (match?.[1]) return { name: 'project', id: decodeURIComponent(match[1]) };
  return { name: 'home' };
}

export function App() {
  const [path, setPath] = React.useState(window.location.pathname);

  React.useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: string) {
    window.history.pushState({}, '', next);
    setPath(next);
  }

  const route = parse(path);
  return (
    <Shell onHome={() => go('/')} onCreate={route.name === 'home' ? () => go('/new') : undefined}>
      {route.name === 'home' && <Dashboard onOpen={(id) => go(`/projects/${id}`)} onCreate={() => go('/new')} />}
      {route.name === 'new' && <NewLora onCancel={() => go('/')} onCreated={(id) => go(`/projects/${id}`)} />}
      {route.name === 'project' && <ProjectView id={route.id} onBack={() => go('/')} />}
    </Shell>
  );
}

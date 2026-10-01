import { Fragment, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import policyEnglish from '@/docs/privacy-policy.md?raw';
import policyChinese from '@/docs/privacy-policy.zh-CN.md?raw';
import '../popup/theme.css';
import './style.css';

const chinese = new URLSearchParams(location.search).get('lang') === 'zh';
document.documentElement.lang = chinese ? 'zh-CN' : 'en';
document.title = chinese ? 'ChatPick 隐私政策' : 'ChatPick Privacy Policy';

browser.storage.local.get({ theme: 'auto' }).then(({ theme }) => {
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches));
}).catch(() => {
  document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);
});

// The policy source uses headings, paragraphs, lists, emphasis, and HTTPS/mail links.
// Render them as React text so policy content never executes HTML or scripts.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https:\/\/|mailto:)[^)]+\))/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function Policy() {
  const blocks = (chinese ? policyChinese : policyEnglish).trim().split(/\n\s*\n/);

  return (
    <main className="policy">
      <nav aria-label={chinese ? '语言' : 'Language'}>
        <a href="?lang=en" aria-current={!chinese ? 'page' : undefined}>English</a>
        <a href="?lang=zh" aria-current={chinese ? 'page' : undefined}>中文</a>
      </nav>
      <article>
        {blocks.map((block, index) => {
          if (block.startsWith('# ')) return <h1 key={index}>{block.slice(2)}</h1>;
          if (block.startsWith('## ')) return <h2 key={index}>{block.slice(3)}</h2>;
          if (block.startsWith('- ')) return <ul key={index}>{block.split('\n').map((line, item) => <li key={item}>{inline(line.slice(2))}</li>)}</ul>;
          return <p key={index}>{inline(block.replace(/\n/g, ' '))}</p>;
        })}
      </article>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Policy />);

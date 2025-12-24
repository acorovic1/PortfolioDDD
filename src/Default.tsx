import { useState } from 'react';
import reactLogo from './assets/react.svg';

function Default()
{
      const [count, setCount] = useState(0);

  

  return (
    <div className="App">
      <header className="App-header">
        <img src={reactLogo} className="App-logo" alt="logo" />
        <p>Edit <code>src/App.tsx</code> and save to reload.</p>
        <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
      </header>
    </div>
  );
}

export default Default;
import React, { useState } from 'react';
import GraphViewer from './components/GraphViewer';
import ChatWindow from './components/ChatWindow';

function App() {
  const [highlightNodes, setHighlightNodes] = useState([]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans">
      
      {/* Sidebar for Chat - 30% width on large screens */}
      <div className="w-full md:w-[380px] lg:w-[450px] h-[50vh] md:h-full shrink-0 flex flex-col z-20">
        <ChatWindow 
          onResultsHighlight={setHighlightNodes} 
          onResetGraph={() => setHighlightNodes([])} 
        />
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 h-[50vh] md:h-full relative overflow-hidden z-10 w-full">
        <GraphViewer 
          highlightNodes={highlightNodes} 
          onReset={() => setHighlightNodes([])}
        />
      </div>
      
    </div>
  );
}

export default App;

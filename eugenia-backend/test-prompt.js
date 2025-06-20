const promptService = require('./services/promptService');

// Wait for prompts to load
setTimeout(() => {
  console.log('Testing prompt generation...\n');
  
  // Get the executable prompt
  const promptFunc = promptService.getExecutablePrompt('conversationReply');
  
  // Test data
  const testData = {
    agencyName: 'Test Agency',
    leadDetails: {
      name: 'Test Lead',
      firstName: 'Test',
      tags: ['buyer', 'urgent'],
      id: '123'
    },
    conversationHistory: 'Test Lead: Hello\nEugenia: Hi Test! Are you Test Lead?\nTest Lead: Yes\nEugenia: Great! What\'s your timeline for moving?',
    currentMessage: 'I need to move next month',
    messageCount: 3,
    totalMessages: 4
  };
  
  // Generate the prompt
  const finalPrompt = promptFunc(testData);
  
  console.log('FINAL PROMPT:');
  console.log('=' .repeat(80));
  console.log(finalPrompt);
  console.log('=' .repeat(80));
  console.log(`\nPrompt length: ${finalPrompt.length} characters`);
  console.log(`Estimated tokens: ${Math.ceil(finalPrompt.length / 4)}`);
  
  process.exit(0);
}, 1000);
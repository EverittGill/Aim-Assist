/**
 * Fix demo user password in database
 * Updates the password hash to match "admin123"
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase } = require('./src/config/supabase');

async function fixDemoPassword() {
  console.log('🔧 Fixing demo user password...\n');
  
  try {
    // Generate correct hash for "admin123"
    const correctHash = await bcrypt.hash('admin123', 10);
    console.log('✅ Generated new password hash for "admin123"');
    
    // Update the demo user's password
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: correctHash })
      .eq('email', 'admin@demo.com')
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to update password:', error);
      return;
    }
    
    console.log('✅ Password updated successfully for admin@demo.com');
    
    // Verify the update worked
    const isValid = await bcrypt.compare('admin123', data.password_hash);
    console.log(`✅ Password verification: ${isValid ? 'Working' : 'Failed'}`);
    
    console.log('\n✨ Demo user password fixed!');
    console.log('You can now login with:');
    console.log('  Email: admin@demo.com');
    console.log('  Password: admin123');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the fix
fixDemoPassword().then(() => process.exit(0));
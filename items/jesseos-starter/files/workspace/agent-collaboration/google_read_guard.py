#!/usr/bin/env python3
"""Fail closed for all delegated tools outside the exact read-only allowlist."""
import json, sys

ALLOWED_TOOLS = frozenset({
    'Read', 'Glob', 'Grep',
    'mcp__claude_ai_Gmail__get_draft',
    'mcp__claude_ai_Gmail__get_message',
    'mcp__claude_ai_Gmail__get_thread',
    'mcp__claude_ai_Gmail__list_drafts',
    'mcp__claude_ai_Gmail__list_labels',
    'mcp__claude_ai_Gmail__search_threads',
    'mcp__claude_ai_Google_Calendar__get_event',
    'mcp__claude_ai_Google_Calendar__list_calendars',
    'mcp__claude_ai_Google_Calendar__list_events',
    'mcp__claude_ai_Google_Calendar__search_events',
    'mcp__claude_ai_Google_Docs__read_doc',
    'mcp__claude_ai_Google_Drive__get_file_metadata',
    'mcp__claude_ai_Google_Drive__get_file_permissions',
    'mcp__claude_ai_Google_Drive__list_recent_files',
    'mcp__claude_ai_Google_Drive__read_file_content',
    'mcp__claude_ai_Google_Drive__search_files',
    'mcp__claude_ai_Google_Sheets__get_spreadsheet',
    'mcp__claude_ai_Google_Sheets__get_values',
})

# Remove currently discovered write tools from model context as a second layer.
# The hook above also rejects future tools absent from the exact read allowlist.
DENIED_TOOLS = frozenset(
    ['Bash','Write','Edit','Agent','WebFetch','WebSearch'] +
    ['mcp__claude_ai_Gmail__'+name for name in [
      'apply_sensitive_message_label','apply_sensitive_thread_label','create_draft','create_label',
      'delete_draft','delete_label','forward','label_message','label_thread','mark_message_spam',
      'mark_thread_spam','reply','send_message','trash_message','trash_thread','unlabel_message',
      'unlabel_thread','unmark_message_spam','unmark_thread_spam','untrash_message','untrash_thread',
      'update_draft','update_label','update_message_labels']] +
    ['mcp__claude_ai_Google_Calendar__'+name for name in ['create_event','delete_event','respond_to_event','update_event','suggest_time']] +
    ['mcp__claude_ai_Google_Docs__update_doc'] +
    ['mcp__claude_ai_Google_Drive__'+name for name in ['copy_file','create_file','download_file_content','share_file','trash_file','update_file']] +
    ['mcp__claude_ai_Google_Sheets__'+name for name in ['append_values','batch_clear_values','copy_sheet_to_another_spreadsheet',
     'insert_dimension','update_formulas','update_spreadsheet','update_values']])

def main():
    try:
        payload=json.load(sys.stdin)
        name=payload.get('tool_name')
        if name in ALLOWED_TOOLS:
            print('{}')  # Normal CLI permission rules still apply.
            return
    except Exception:
        pass
    print(json.dumps({'hookSpecificOutput':{'hookEventName':'PreToolUse',
          'permissionDecision':'deny','permissionDecisionReason':
          'Delegated Google access permits only explicitly listed read tools; writes and unknown tools are blocked.'}}))

if __name__=='__main__':main()

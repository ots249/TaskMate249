# Security Specification — TaskMate 249

## 1. Data Invariants
- Tasks are strictly isolated per user under the subcollection `/users/{userId}/tasks/{taskId}`.
- Only the authenticated user matching `{userId}` can read, query, create, update, or delete their own tasks.
- A task must always have a valid `title`, `category`, `status`, `createdAt`, and `updatedAt`.
- `createdAt` is immutable once set and must match `request.time` at document creation.
- `updatedAt` must always match `request.time` on document updates.
- Categories are constrained to the enumerated list: `assignment`, `practical`, `class-task`, `exam`, `other`.
- Status is constrained to `pending` or `completed`.
- Title string length is bounded between 1 and 200 characters.
- Subject string length is bounded to a maximum of 100 characters.
- Deadline string length is bounded to a maximum of 50 characters.

## 2. Dirty Dozen Payloads (Targeting Exploits to be Blocked)
1. **Unauthenticated Read**: Attempting to read `/users/user123/tasks/task1` without auth -> PERMISSION_DENIED.
2. **Cross-User Snooping**: Authenticated user A reading tasks belonging to user B (`/users/userB/tasks/...`) -> PERMISSION_DENIED.
3. **Cross-User List Scraping**: Authenticated user A querying `/users/userB/tasks` -> PERMISSION_DENIED.
4. **Forged CreatedAt**: Client supplying client timestamp instead of `request.time` -> PERMISSION_DENIED.
5. **CreatedAt Mutation**: Client attempting to alter `createdAt` on update -> PERMISSION_DENIED.
6. **Shadow Field Injection**: Attempting to save unexpected fields like `isAdmin: true` or `role: 'admin'` -> PERMISSION_DENIED.
7. **Invalid Category Poisoning**: Attempting to set category to `'admin-override'` or SQL/NoSQL payload -> PERMISSION_DENIED.
8. **Invalid Status Poisoning**: Attempting to set status to `'deleted'` or arbitrary string -> PERMISSION_DENIED.
9. **Volumetric Denial of Wallet**: Title string payload exceeding 200 characters -> PERMISSION_DENIED.
10. **ID Poisoning Attack**: Task ID containing malicious slashes or characters violating `isValidId` -> PERMISSION_DENIED.
11. **Cross-User Task Creation**: Authenticated user A writing a document to `/users/userB/tasks/task1` -> PERMISSION_DENIED.
12. **Cross-User Task Deletion**: Authenticated user A calling delete on `/users/userB/tasks/task1` -> PERMISSION_DENIED.

Underline tab bar for in-page sections.

```jsx
<Tabs items={[{value:"profile",label:"Profile"},{value:"orders",label:"Orders"}]} active="profile" onChange={setTab} />
```

Active tab is red text over a 2px red underline. For filtering a list by status use `FilterPills` instead.

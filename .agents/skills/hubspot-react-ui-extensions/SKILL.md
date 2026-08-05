---
name: hubspot-react-ui-extensions
description: Scaffolding, components, GraphQL queries, and state management for HubSpot React UI Extensions (App Cards) on CRM record pages.
---

# Skill: HubSpot React UI Extensions (App Cards)

React-based UI Extensions (App Cards) allow developers to render interactive components directly on HubSpot CRM record pages (Contacts, Companies, Deals, Tickets, Custom Objects).

---

## 1. Extension Configuration (`CardExtension.json`)

Extensions live inside the `src/app/extensions/` directory.

```json
{
  "type": "crm-card",
  "data": {
    "title": "Account Health & Analytics",
    "location": "crm.record.tab",
    "objectTypes": ["CONTACT", "COMPANY", "DEAL"],
    "file": "CardExtension.jsx"
  }
}
```

### Supported Locations
*   `crm.record.tab`: Full tab on the record page.
*   `crm.record.sidebar`: Middle panel sidebar card.

---

## 2. React UI Component Library

UI Extensions **must** use standard HubSpot UI components from `@hubspot/ui-extensions` to guarantee accessibility and responsive design.

### Available UI Components
`hubspot.extend`, `Button`, `Text`, `Heading`, `Tile`, `Table`, `Flex`, `Input`, `Select`, `Form`, `Modal`, `LoadingSpinner`, `Alert`, `Badge`, `Divider`, `Tag`.

---

## 3. Standard App Card Template (`CardExtension.jsx`)

```jsx
import React, { useState, useEffect } from 'react';
import {
  hubspot,
  Button,
  Text,
  Heading,
  Tile,
  Flex,
  LoadingSpinner,
  Alert,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TableHead
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <Extension
    context={context}
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

const Extension = ({ context, runServerlessFunction, actions }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Extract associated record context
  const objectId = context.crm.objectId;
  const objectType = context.crm.objectTypeId;

  useEffect(() => {
    fetchCardData();
  }, [objectId]);

  const fetchCardData = async () => {
    setLoading(true);
    try {
      const response = await runServerlessFunction({
        name: 'getAccountSummary',
        parameters: { objectId, objectType }
      });

      if (response.status === 'SUCCESS') {
        setData(response.response.body);
      } else {
        setError(response.response.message || 'Failed to fetch card data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading account data..." />;
  if (error) return <Alert title="Error Loading Data" variant="danger">{error}</Alert>;

  return (
    <Tile>
      <Flex direction="column" gap="md">
        <Heading level={2}>Account Summary</Heading>
        <Text>Record ID: {objectId}</Text>
        
        {data && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Metric</TableHeader>
                <TableHeader>Value</TableHeader>
              </TableRow>
            </TableHead>
            {Object.entries(data.metrics || {}).map(([key, val]) => (
              <TableRow key={key}>
                <TableCell>{key}</TableCell>
                <TableCell>{String(val)}</TableCell>
              </TableRow>
            ))}
          </Table>
        )}

        <Button onClick={fetchCardData} variant="primary">
          Refresh Data
        </Button>
      </Flex>
    </Tile>
  );
};
```

---

## 4. Fetching Data with GraphQL

For complex relationships (e.g. retrieving a Deal's associated Contact and Company in a single request), use GraphQL queries within UI Extensions.

```graphql
query GetDealAssociations($hs_object_id: String!) {
  CRM {
    deal(hs_object_id: $hs_object_id) {
      dealname
      amount
      stage
      associations {
        company_collection__primary {
          items {
            name
            domain
          }
        }
        contact_collection__primary {
          items {
            email
            firstname
            lastname
          }
        }
      }
    }
  }
}
```

---

## 5. UI Extension Best Practices

1.  **Fast Initial Render**: Render skeletons or `LoadingSpinner` immediately while serverless queries execute.
2.  **Error Boundaries**: Wrap serverless calls in `try/catch` and display meaningful alert feedback (`Alert` component).
3.  **Action Handlers**: Use `actions.addAlert` or `actions.openIframe` to trigger global CRM toasts or modals smoothly.

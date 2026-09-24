// Collection definitions modelled from the FinCrime 3.0 Elasticsearch index reference.
// Each entry describes the MongoDB collection name, the regular indexes to create,
// and an Atlas Search index definition (the MongoDB equivalent of the ES mapping).

/**
 * Regular index spec: { key: {...}, options: {...} }
 * Search index spec: { name, definition } passed to createSearchIndex.
 *
 * Atlas Search field types used:
 *  - "token"  -> keyword-style exact match / sort (ES "keyword")
 *  - "string" -> analyzed full text (ES "text")
 *  - "date", "boolean", "number"
 *  - "document" / "embeddedDocuments" -> nested objects/arrays
 */

const configColumnFields = {
  type: 'embeddedDocuments',
  dynamic: false,
  fields: {
    attributeName: { type: 'token' },
    attributeLabel: { type: 'string' },
    attributeValue: [{ type: 'string' }, { type: 'token' }],
    attributeType: { type: 'token' },
    columnType: { type: 'token' },
    listType: { type: 'token' }
  }
};

const caseRolesFields = {
  type: 'embeddedDocuments',
  dynamic: false,
  fields: {
    caseRole: { type: 'token' },
    users: { type: 'token' }
  }
};

export const COLLECTIONS = [
  {
    name: 'task_metadata_entity',
    description: 'Current-state view of workflow tasks (analyst queues, SLA, assignment).',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { caseDisplayId: 1 }, options: { name: 'idx_caseDisplayId' } },
      { key: { assignee: 1 }, options: { name: 'idx_assignee' } },
      { key: { internalTaskStatus: 1 }, options: { name: 'idx_internalTaskStatus' } },
      { key: { removed: 1, paused: 1 }, options: { name: 'idx_removed_paused' } },
      { key: { dateCreated: -1 }, options: { name: 'idx_dateCreated' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            caseId: { type: 'token' },
            caseDisplayId: [{ type: 'string' }, { type: 'token' }, { type: 'autocomplete' }],
            caseStatus: [{ type: 'string' }, { type: 'token' }, { type: 'stringFacet' }],
            internalTaskStatus: [{ type: 'token' }, { type: 'stringFacet' }],
            taskName: [{ type: 'string' }, { type: 'autocomplete' }],
            taskType: [{ type: 'token' }, { type: 'stringFacet' }],
            description: [{ type: 'string' }, { type: 'token' }],
            assignee: [{ type: 'token' }, { type: 'stringFacet' }],
            caseOwner: { type: 'token' },
            caseRoles: caseRolesFields,
            taskListColumnConfigurations: configColumnFields
          }
        }
      }
    }
  },
  {
    name: 'task_history',
    description: 'Immutable snapshot history of every task state change.',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { 'compositeId.taskId': 1 }, options: { name: 'idx_taskId' } },
      { key: { internalTaskStatus: 1 }, options: { name: 'idx_internalTaskStatus' } },
      { key: { dateCreated: -1 }, options: { name: 'idx_dateCreated' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            caseId: { type: 'token' },
            caseDisplayId: { type: 'token' },
            internalTaskStatus: [{ type: 'token' }, { type: 'stringFacet' }],
            taskName: { type: 'string' },
            description: { type: 'token' },
            assignee: [{ type: 'token' }, { type: 'stringFacet' }],
            caseRoles: caseRolesFields,
            taskListColumnConfigurations: configColumnFields
          }
        }
      }
    }
  },
  {
    name: 'case_entity',
    description: 'Primary searchable case/investigation record (status, workflow, risk).',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId', unique: true } },
      { key: { status: 1 }, options: { name: 'idx_status' } },
      { key: { 'workflow.projectName': 1 }, options: { name: 'idx_projectName' } },
      { key: { versionDate: -1 }, options: { name: 'idx_versionDate' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            caseId: { type: 'token' },
            caseDisplayId: [{ type: 'string' }, { type: 'token' }, { type: 'autocomplete' }],
            entityName: [{ type: 'string' }, { type: 'token' }, { type: 'autocomplete' }],
            status: [{ type: 'token' }, { type: 'stringFacet' }],
            createdOnDate: [{ type: 'date' }, { type: 'dateFacet' }],
            workflow: {
              type: 'document',
              dynamic: false,
              fields: {
                workflowName: [{ type: 'token' }, { type: 'stringFacet' }],
                projectName: [{ type: 'string' }, { type: 'token' }, { type: 'stringFacet' }],
                dataModelCode: [{ type: 'token' }, { type: 'stringFacet' }]
              }
            },
            columnConfigurations: configColumnFields,
            caseRoles: {
              type: 'embeddedDocuments',
              dynamic: false,
              fields: {
                caseRole: { type: 'token' },
                users: { type: 'token' }
              }
            }
          }
        }
      }
    }
  },
  {
    name: 'document_center_entity',
    description: 'Document/attachment metadata linked to cases (upload, classification, expiry).',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { documentGUID: 1 }, options: { name: 'idx_documentGUID' } },
      { key: { documentType: 1 }, options: { name: 'idx_documentType' } },
      { key: { active: 1 }, options: { name: 'idx_active' } },
      { key: { ingestionDate: -1 }, options: { name: 'idx_ingestionDate' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            caseId: [{ type: 'string' }, { type: 'token' }],
            documentName: [{ type: 'string' }, { type: 'autocomplete' }],
            documentOriginalName: { type: 'string' },
            documentType: [{ type: 'token' }, { type: 'stringFacet' }],
            documentSubType: [{ type: 'token' }, { type: 'stringFacet' }],
            uploadedBy: [{ type: 'token' }, { type: 'stringFacet' }],
            tags: { type: 'string' },
            ingestionDate: { type: 'number' },
            columnConfigurations: configColumnFields
          }
        }
      }
    }
  },
  {
    name: 'entity_list',
    description: 'Screened parties/entities (individuals & organisations) linked to cases.',
    seedable: true,
    indexes: [
      { key: { id: 1 }, options: { name: 'idx_id' } },
      { key: { itemType: 1 }, options: { name: 'idx_itemType' } },
      { key: { tenant: 1 }, options: { name: 'idx_tenant' } },
      { key: { isDeleted: 1 }, options: { name: 'idx_isDeleted' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            id: { type: 'token' },
            displayName: [{ type: 'string' }, { type: 'token' }, { type: 'autocomplete' }],
            itemType: [{ type: 'token' }, { type: 'stringFacet' }],
            tenant: [{ type: 'token' }, { type: 'stringFacet' }],
            businessKey: { type: 'string' },
            entityListColumnConfigurations: configColumnFields
          }
        }
      }
    }
  },
  {
    name: 'link_cases',
    description: 'Relationship edges between cases (parent/child, duplicate, related alerts).',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { linkCaseId: 1 }, options: { name: 'idx_linkCaseId' } },
      { key: { relationshipType: 1 }, options: { name: 'idx_relationshipType' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            caseId: [{ type: 'string' }, { type: 'token' }],
            linkCaseId: { type: 'token' },
            relationshipType: [{ type: 'token' }, { type: 'stringFacet' }],
            linkLabel: { type: 'string' },
            createdBy: { type: 'token' },
            columnConfigurations: configColumnFields
          }
        }
      }
    }
  },
  {
    name: 'audit-data-service',
    description: 'Central compliance audit log — one event per user/system action.',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { author: 1 }, options: { name: 'idx_author' } },
      { key: { event: 1 }, options: { name: 'idx_event' } },
      { key: { timestamp: -1 }, options: { name: 'idx_timestamp' } },
      { key: { application: 1 }, options: { name: 'idx_application' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: true,
          fields: {
            caseId: { type: 'token' },
            author: [{ type: 'token' }, { type: 'stringFacet' }],
            description: { type: 'string' },
            event: [{ type: 'token' }, { type: 'stringFacet' }],
            application: [{ type: 'token' }, { type: 'stringFacet' }],
            scope: [{ type: 'token' }, { type: 'stringFacet' }],
            status: [{ type: 'token' }, { type: 'stringFacet' }],
            notificationId: { type: 'token' },
            timestamp: { type: 'number' },
            auditListColumnEntityList: {
              type: 'embeddedDocuments',
              dynamic: false,
              fields: {
                attributeName: { type: 'token' },
                attributeLabel: { type: 'string' },
                attributeValue: { type: 'string' },
                columnType: { type: 'token' }
              }
            }
          }
        }
      }
    }
  },
  {
    name: 'case_graph',
    description: 'Graph/network topology (nodes & edges) for the case relationship visualizer.',
    seedable: true,
    indexes: [
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: true,
          fields: {
            caseId: { type: 'token' }
          }
        }
      }
    }
  },
  {
    name: 'data_block_business_keys_entity',
    description: 'Business keys extracted from ingested data blocks (dedup / idempotency keys).',
    seedable: true,
    indexes: [
      { key: { dataBlockGUID: 1 }, options: { name: 'idx_dataBlockGUID' } },
      { key: { blockSchema: 1 }, options: { name: 'idx_blockSchema' } },
      { key: { tenant: 1 }, options: { name: 'idx_tenant' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            dataBlockGUID: { type: 'token' },
            blockSchema: [{ type: 'token' }, { type: 'stringFacet' }],
            tenant: [{ type: 'token' }, { type: 'stringFacet' }],
            dataBlockBusinessKeys: { type: 'string' }
          }
        }
      }
    }
  },
  {
    name: 'data_block_recycling_request',
    description: 'Recycling/reprocessing queue for data blocks pending schema or business-key resolution.',
    seedable: true,
    indexes: [
      { key: { id: 1 }, options: { name: 'idx_id' } },
      { key: { caseId: 1 }, options: { name: 'idx_caseId' } },
      { key: { status: 1 }, options: { name: 'idx_status' } }
    ],
    searchIndex: {
      name: 'default',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            id: { type: 'token' },
            caseId: [{ type: 'string' }, { type: 'token' }],
            status: [{ type: 'string' }, { type: 'token' }, { type: 'stringFacet' }],
            schemaCode: [{ type: 'string' }, { type: 'token' }],
            businessKey: { type: 'string' }
          }
        }
      }
    }
  }
];

export const COLLECTION_NAMES = COLLECTIONS.map((c) => c.name);

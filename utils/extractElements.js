const WebIFC  = require('web-ifc');

const getMaterialForElement = (ifcApi, modelID, elementID) => {
  const materialRelTypes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
  for (let i = 0; i < materialRelTypes.size(); i++) {
    const relID = materialRelTypes.get(i);
    const rel = ifcApi.GetLine(modelID, relID);

    const relatedObjects = rel.RelatedObjects || [];
    const relatedObjectIDs = relatedObjects.map(obj => obj.value);

    if (relatedObjectIDs.includes(elementID)) {
      // Check if it’s a direct material
      const relatingMaterial = rel.RelatingMaterial;
      if (relatingMaterial) {
        const mat = ifcApi.GetLine(modelID, relatingMaterial.value);
        if (mat && mat.Name?.value) {
          return mat.Name.value;
        }
        // Handle IfcMaterialLayerSetUsage case
        if (mat.MaterialLayers) {
          const layers = mat.MaterialLayers;
          const firstLayer = ifcApi.GetLine(modelID, layers[0].value);
          if (firstLayer && firstLayer.Material) {
            const material = ifcApi.GetLine(modelID, firstLayer.Material.value);
            if (material?.Name?.value) return material.Name.value +"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
          }
        }
      }
    }
  }
  return 'Unknown';
};
const getQuantity = (ifcApi, modelID, elementID, quantityType) => {
  const propRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);

  for (let i = 0; i < propRels.size(); i++) {
    const rel = ifcApi.GetLine(modelID, propRels.get(i));

    const relatedObjects = rel.RelatedObjects?.map(o => o.value);
    if (!relatedObjects || !relatedObjects.includes(elementID)) continue;

    const propDef = ifcApi.GetLine(modelID, rel.RelatingPropertyDefinition.value);

    if (propDef.hasOwnProperty('Quantities')) {
      for (const q of propDef.Quantities) {
        const quantity = ifcApi.GetLine(modelID, q.value);
        if (quantity.type === quantityType) {
          return quantity.Value?.value || quantity.AreaValue?.value || quantity.LengthValue?.value || 'N/A';
        }
      }
    }
  }
  return 'N/A';
};



// const getLengthForElement = (ifcApi, modelID, elementID) => {
//   const properties = ifcApi.GetLine(modelID, elementID);
//   // Common properties for length might be NominalLength, OverallLength, etc.
//   // We'll check for NominalLength first, then OverallLength.
//   return properties.NominalLength?.value || properties.OverallLength?.value || 'N/A';
// };

const getColorForElement = (ifcApi, modelID, elementID) => {
  const styledItems = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSTYLEDITEM);

  for (let i = 0; i < styledItems.size(); i++) {
    const styledItem = ifcApi.GetLine(modelID, styledItems.get(i)); // This is an IfcStyledItem

    // Check if this IfcStyledItem is associated with the requested elementID
    if (styledItem.Item?.value === elementID && styledItem.Styles?.length > 0) {
      // styledItem.Styles is a SET of IfcPresentationStyleAssignment
      // We'll take the first style assignment for simplicity
      const presentationStyleAssignmentRef = styledItem.Styles[0];
      const presentationStyleAssignment = ifcApi.GetLine(modelID, presentationStyleAssignmentRef.value);

      // presentationStyleAssignment.Styles is a SET of IfcPresentationStyleSelect
      if (presentationStyleAssignment.Styles && presentationStyleAssignment.Styles.length > 0) {
        // We'll take the first style select (e.g., IfcSurfaceStyle)
        const styleSelectRef = presentationStyleAssignment.Styles[0];
        const styleSelect = ifcApi.GetLine(modelID, styleSelectRef.value);

        // Check if it's an IfcSurfaceStyle
        if (styleSelect.type === WebIFC.IFCSURFACESTYLE && styleSelect.Styles?.length > 0) {
          // styleSelect.Styles is a SET of IfcSurfaceStyleElementSelect (e.g., IfcSurfaceStyleShading)
          for (const surfaceStyleElementRef of styleSelect.Styles) {
            const surfaceStyleElement = ifcApi.GetLine(modelID, surfaceStyleElementRef.value);
            // Check if it's IfcSurfaceStyleShading and has SurfaceColour
            if (surfaceStyleElement.type === WebIFC.IFCSURFACESTYLESHADING && surfaceStyleElement.SurfaceColour) {
              const color = surfaceStyleElement.SurfaceColour;
              const r = Math.round(Number(color.Red?.value || 0) * 255);
              const g = Math.round(Number(color.Green?.value || 0) * 255);
              const b = Math.round(Number(color.Blue?.value || 0) * 255);
              return `rgb(${r}, ${g}, ${b})`;
            }
          }
        }
      }
    }
  }
  return 'N/Ax'; // Default if no color found
};

function getLengthForElement(props, ifcType) {
  const getValue = (val) =>
    typeof val === 'object' && val?.value !== undefined ? val.value : val;

  switch (ifcType.toUpperCase()) {
    case 'IFCWALL':
      return getValue(props.NominalLength);
    case 'IFCBEAM':
    case 'IFCPIPESEGMENT':
    case 'IFCCOLUMN':
      return getValue(props.Length) || getValue(props.NominalLength);
    case 'IFCDOOR':
    case 'IFCWINDOW':
      return getValue(props.OverallWidth) || getValue(props.NominalWidth);
    case 'IFCSLAB':
    case 'IFCROOF':
      return getValue(props.NominalLength);
    default:
      return (
        getValue(props.NominalLength) ||
        getValue(props.Length) ||
        getValue(props.OverallLength) ||
        null
      );
  }
}

async function getLengthFromPset(ifcApi, modelID, elementID) {
    const element = ifcApi.GetLine(modelID, elementID);
    if (!element.IsDefinedBy) return 'N/A';

    for (const rel of element.IsDefinedBy) {
        const relDef = ifcApi.GetLine(modelID, rel.value);
        if (relDef.RelatingPropertyDefinition) {
            const propSet = ifcApi.GetLine(modelID, relDef.RelatingPropertyDefinition.value);
            if (propSet.HasProperties) {
                for (const prop of propSet.HasProperties) {
                    const property = ifcApi.GetLine(modelID, prop.value);
                    const name = property.Name?.value?.toLowerCase();
                    if (name && name.includes('LENGTH')) {
                        return property.NominalValue?.value || property.ValueComponent?.value || 'N/A';
                    }
                }
            }
        }
    }

    return 'N/A';
}

async function getElementLength(ifcApi, modelID, elementID, ifcType) {
  // 1. Try direct properties
  const props = ifcApi.GetLine(modelID, elementID);
  const getValue = (val) =>
    typeof val === 'object' && val?.value !== undefined ? val.value : val;

  let length = null;
  switch (ifcType.toUpperCase()) {
    case 'IFCWALL':
      length = getValue(props.NominalLength);
      break;
    case 'IFCBEAM':
    case 'IFCPIPESEGMENT':
    case 'IFCCOLUMN':
      length = getValue(props.Length) || getValue(props.NominalLength);
      break;
    case 'IFCDOOR':
    case 'IFCSLAB':
    case 'IFCROOF':
      length = getValue(props.NominalLength);
      break;
    default:
      length =
        getValue(props.NominalLength) ||
        getValue(props.Length) ||
        getValue(props.OverallLength) ||
        null;
  }

  // 2. If not found, try property sets
  if (!length || length === 'N/A') {
    if (props.IsDefinedBy) {
      for (const rel of props.IsDefinedBy) {
        const relDef = ifcApi.GetLine(modelID, rel.value);
        if (relDef.RelatingPropertyDefinition) {
          const propSet = ifcApi.GetLine(modelID, relDef.RelatingPropertyDefinition.value);
          if (propSet.HasProperties) {
            for (const prop of propSet.HasProperties) {
              const property = ifcApi.GetLine(modelID, prop.value);
              const name = property.Name?.value?.toLowerCase();
              if (name && name.includes('length')) {
                length = property.NominalValue?.value || property.ValueComponent?.value || 'N/A';
                if (length && length !== 'N/A') return length;
              }
            }
          }
        }
      }
    }
  }

  return length || 'xxx';
}

/**
 * Updates the Name property of a given IFC element.
 * @param {object} ifcApi The IfcAPI instance.
 * @param {number} modelID The ID of the IFC model.
 * @param {number} elementID The expressID of the element to update.
 * @param {string} newName The new name to set for the element.
 * @returns {boolean} True if the update was successful, false otherwise.
 */
const updateElementName = (ifcApi, modelID, elementID, newName) => {
  try {
    const elementProperties = ifcApi.GetLine(modelID, elementID);
    if (!elementProperties) {
      console.error(`Element with ID ${elementID} not found in model ${modelID}.`);
      return false;
    }

    // The 'Name' property in IFC is typically an IfcLabel, which is a STRING.
    // In web-ifc's GetLine representation, a string property is often { type: 5, value: "string value" }.
    // If the Name property already exists, update its value.
    if (elementProperties.Name && typeof elementProperties.Name === 'object' && 'value' in elementProperties.Name) {
      elementProperties.Name.value = newName;
    } else {
      // If Name property doesn't exist or is not in the expected object format,
      // create or overwrite it with the standard structure for a string property.
      elementProperties.Name = { type: 5, value: newName }; // type: 5 typically for STRING
    }

    ifcApi.WriteLine(modelID, elementProperties);
    return true;
  } catch (error) {
    console.error(`Error updating name for element ${elementID} to "${newName}":`, error);
    return false;
  }
};

/**
 * Updates the name, material, and CFC code of multiple IFC elements.
 *
 * @param {object} ifcApi The IfcAPI instance.
 * @param {number} modelID The ID of the IFC model.
 * @param {Array<object>} updates An array of update objects, each with:
 *   - elementId (number)
 *   - newName (string, optional)
 *   - materiau (string, optional)
 *   - code_CFC (string, optional)
 * @returns {object} Summary and details of the update operations.
 */
const updateIfcElement = (ifcApi, modelID, updates) => {
  console.log('***************************test update ********************************');
  console.log('updates', updates);
  if (!ifcApi || typeof modelID !== 'number' || !Array.isArray(updates)) {
    return {
      summary: { totalAttempted: updates?.length || 0, successful: 0, failed: updates?.length || 0 },
      details: (updates || []).map(u => ({
        elementId: u?.elementId || "N/A",
        status: "failed",
        reason: "Invalid arguments provided to updateIfcElement function."
      })),
      error: "Invalid arguments provided to function."
    };
  }

  let successfulUpdates = 0;
  let failedUpdates = 0;
  const updateDetails = [];

  for (const update of updates) {
    if (
      typeof update !== 'object' ||
      update === null ||
      typeof update.elementId !== 'number'
    ) {
      failedUpdates++;
      updateDetails.push({
        elementId: update?.elementId || "N/A",
        status: "failed",
        reason: "Invalid update object structure or missing/invalid elementId."
      });
      continue;
    }

    const { elementId, newName, materiau, code_CFC } = update;
    let elementUpdated = false;
    let errors = [];

    // --- Update Name ---
    try {
      if (typeof newName === 'string') {
        const elementProperties = ifcApi.GetLine(modelID, elementId);
        if (elementProperties) {
          if (elementProperties.Name && typeof elementProperties.Name === 'object' && 'value' in elementProperties.Name) {
            elementProperties.Name.value = newName;
          } else {
            elementProperties.Name = { type: 5, value: newName };
          }
          ifcApi.WriteLine(modelID, elementProperties);
          elementUpdated = true;
        } else {
          errors.push("Element not found for name update.");
        }
      }
    } catch (err) {
      errors.push("Name update error: " + err.message);
    }

    // --- Update Material ---
    try {
      if (typeof materiau === 'string') {
        const materialRelTypes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
        let foundMaterial = false;
        for (let i = 0; i < materialRelTypes.size(); i++) {
          const relID = materialRelTypes.get(i);
          const rel = ifcApi.GetLine(modelID, relID);
          const relatedObjects = rel.RelatedObjects || [];
          const relatedObjectIDs = relatedObjects.map(obj => obj.value);
          if (relatedObjectIDs.includes(elementId) && rel.RelatingMaterial) {
            const mat = ifcApi.GetLine(modelID, rel.RelatingMaterial.value);
            if (mat && mat.Name && typeof mat.Name === 'object' && 'value' in mat.Name) {
              mat.Name.value = materiau;
              ifcApi.WriteLine(modelID, mat);
              elementUpdated = true;
              foundMaterial = true;
            }
          }
        }
        if (!foundMaterial) errors.push("No related material found to update.");
      }
    } catch (err) {
      errors.push("Material update error: " + err.message);
    }

    // --- Update CFC/Classification Code ---
    try {
      if (typeof code_CFC === 'string') {
        const relAssocClassIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
        let foundCFC = false;
        for (let i = 0; i < relAssocClassIDs.size(); i++) {
          const relID = relAssocClassIDs.get(i);
          const rel = ifcApi.GetLine(modelID, relID);
          const relatedObjects = rel.RelatedObjects || [];
          if (relatedObjects.some(obj => obj.value === elementId) && rel.RelatingClassification?.value) {
            const classificationRefID = rel.RelatingClassification.value;
            const classificationEntity = ifcApi.GetLine(modelID, classificationRefID);
            if (classificationEntity && classificationEntity.type === WebIFC.IFCCLASSIFICATIONREFERENCE) {
              if (classificationEntity.ItemReference && typeof classificationEntity.ItemReference === 'object' && 'value' in classificationEntity.ItemReference) {
                classificationEntity.ItemReference.value = code_CFC;
              } else {
                classificationEntity.ItemReference = { type: 5, value: code_CFC };
              }
              ifcApi.WriteLine(modelID, classificationEntity);
              elementUpdated = true;
              foundCFC = true;
            }
          }
        }
        if (!foundCFC) errors.push("No related CFC/classification found to update.");
      }
    } catch (err) {
      errors.push("CFC update error: " + err.message);
    }

    if (elementUpdated) {
      successfulUpdates++;
      updateDetails.push({
        elementId,
        newName,
        materiau,
        code_CFC,
        status: "success"
      });
    } else {
      failedUpdates++;
      updateDetails.push({
        elementId,
        newName,
        materiau,
        code_CFC,
        status: "failed",
        reason: errors.length ? errors.join("; ") : "No updates applied."
      });
    }
  }

  return {
    summary: { totalAttempted: updates.length, successful: successfulUpdates, failed: failedUpdates },
    details: updateDetails
  };
};

/**
 * Extracts classification information for a given IFC element.
 * @param {object} ifcApi The IfcAPI instance.
 * @param {number} modelID The ID of the IFC model.
 * @param {number} elementID The expressID of the element.
 * @returns {Array<object>} An array of classification objects, or an empty array if none found.
 *                          Each object may contain: system, code, title, location, source, edition, description.
 */
const getElementClassifications = (ifcApi, modelID, elementID) => {
  const classifications = [];
  const relAssocClassIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESCLASSIFICATION);

  for (let i = 0; i < relAssocClassIDs.size(); i++) {
    const relID = relAssocClassIDs.get(i);
    const rel = ifcApi.GetLine(modelID, relID);

    // Check if this association is for the current element
    const relatedObjects = rel.RelatedObjects || [];
    let isRelated = false;
    for (const objProxy of relatedObjects) {
      if (objProxy.value === elementID) {
        isRelated = true;
        break;
      }
    }

    if (isRelated && rel.RelatingClassification?.value) {
      const classificationRefID = rel.RelatingClassification.value;
      const classificationEntity = ifcApi.GetLine(modelID, classificationRefID);

      if (!classificationEntity) {
        console.warn(`Classification entity with ID ${classificationRefID} not found for element ${elementID}.`);
        continue;
      }

      const classificationData = {
        system: null,
        code: null,
        title: null,
        location: null,
        source: null,
        edition: null,
        description: null,
      };

      if (classificationEntity.type === WebIFC.IFCCLASSIFICATIONREFERENCE) {
        classificationData.code = classificationEntity.ItemReference?.value || null;
        classificationData.title = classificationEntity.Name?.value || null;
        classificationData.location = classificationEntity.Location?.value || null;
        classificationData.description = classificationEntity.Description?.value || null;

        if (classificationEntity.ReferencedSource?.value) {
          const referencedSourceEntity = ifcApi.GetLine(modelID, classificationEntity.ReferencedSource.value);
          if (referencedSourceEntity && referencedSourceEntity.type === WebIFC.IFCCLASSIFICATION) {
            classificationData.system = referencedSourceEntity.Name?.value || null;
            classificationData.source = referencedSourceEntity.Source?.value || null;
            classificationData.edition = referencedSourceEntity.Edition?.value || null;
            if (!classificationData.location) {
                classificationData.location = referencedSourceEntity.Location?.value || null;
            }
            if (!classificationData.description && referencedSourceEntity.Description?.value) {
                classificationData.description = referencedSourceEntity.Description.value;
            }
          } else if (referencedSourceEntity && referencedSourceEntity.type === WebIFC.IFCCLASSIFICATIONREFERENCE) {
            classificationData.system = referencedSourceEntity.Name?.value || classificationData.system; // Fallback
          }
        }
      } else if (classificationEntity.type === WebIFC.IFCCLASSIFICATION) {
        classificationData.system = classificationEntity.Name?.value || null;
        classificationData.source = classificationEntity.Source?.value || null;
        classificationData.edition = classificationEntity.Edition?.value || null;
        classificationData.location = classificationEntity.Location?.value || null;
        classificationData.description = classificationEntity.Description?.value || null;
      }

      if (classificationData.system || classificationData.code || classificationData.title) {
        classifications.push(classificationData);
      }
    }
  }
  return classifications;
};

exports.getElementLength = getElementLength;
exports.getLengthFromPset = getLengthFromPset;
exports.getMaterialForElement = getMaterialForElement;
exports.getQuantity = getQuantity;
exports.getLengthForElement = getLengthForElement;
exports.getColorForElement = getColorForElement;
exports.updateElementName = updateElementName;
exports.updateIfcElement = updateIfcElement;
exports.getElementClassifications = getElementClassifications;

/*
 * Test this with:
 *
 * $ npx jscodeshift -d -p -t scripts/react-text-refs.ts MyClass.js
 *
 * Run on an entire code base with:
 *
 * $ npx jscodeshift -t scripts/react-text-refs.ts ~/dev/myproject/src
 *
 */
import {
  ASTPath,
  ClassDeclaration,
  JSXAttribute,
  Transform,
  MemberExpression,
} from "jscodeshift";

export const parser = "flow";

// Convert react-15 style "text" refs into react-16 createRefs.
const transform: Transform = (fileInfo, api) => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Find all the JSX attributes of the format `ref="somestring"`.
  const refDefinitions = root.find(
    j.JSXAttribute,
    (attr: JSXAttribute) =>
      attr.name.name === "ref" && attr.value.type === "Literal"
  );

  refDefinitions.forEach((def) => {
    const { node } = def;

    // We already know this is type literal, but make typescript happy.  :)
    if (node.value.type !== "Literal") {
      return;
    }

    const oldRefName = node.value.value;
    const newRefName = `${oldRefName}Ref`;

    const clazz = findEnclosingClass(def);
    if (!clazz) {
      // Wat?
      console.log(`Cannot fix ref ${oldRefName} in ${fileInfo.path}`);
      return;
    }

    // Add a "somestringRef = createRef()" class property.
    clazz.node.body.body.unshift(
      j.classProperty(
        j.identifier(newRefName),
        j.callExpression(
          j.memberExpression(j.identifier("React"), j.identifier("createRef")),
          []
        )
      )
    );

    // Replace `ref="somestring"` with `ref={this.somestringRef}`.
    def.replace(
      j.jsxAttribute(
        j.jsxIdentifier("ref"),
        j.jsxExpressionContainer(
          j.memberExpression(j.thisExpression(), j.identifier(newRefName))
        )
      )
    );

    // Find all the places where we use the ref.  Note that this doesn't fix
    // *everything*, it just replaces instances of `this.refs.xxx` with
    // `this.xxxRef.current`.  You may have to manually clean up other references.
    root
      .find(j.MemberExpression, (node: MemberExpression) => {
        return (
          node.object.type === "MemberExpression" &&
          node.object.object.type === "ThisExpression" &&
          node.object.property.type === "Identifier" &&
          node.object.property.name === "refs" &&
          node.property.type === "Identifier" &&
          node.property.name === oldRefName
        );
      })
      .replaceWith(() =>
        j.memberExpression(
          j.memberExpression(
            j.thisExpression(),
            j.identifier(newRefName),
            false
          ),
          j.identifier("current"),
          false
        )
      );
  });

  return root.toSource();
};

function findEnclosingClass(
  node: ASTPath
): ASTPath<ClassDeclaration> | undefined {
  let current = node.parentPath as ASTPath | undefined;
  if (!current) {
    return undefined;
  } else if (current.node.type === "ClassDeclaration") {
    return current as ASTPath<ClassDeclaration>;
  } else {
    return findEnclosingClass(current);
  }
}

export default transform;

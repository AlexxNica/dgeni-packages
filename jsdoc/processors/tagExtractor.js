var _ = require('lodash');
var log = require('winston');

/**
 * Create a function that will extract information, to properties on the tag or doc, from the tags
 * that were parsed from the doc.
 *
 * @param  {Array} tagDefs
 *           A collection of tagDefinitions to extract from the parsed tags.
 * @param  {function(doc, tag, value)|Array.<function(doc, tag, value)>} [defaultTransforms]
 *           A single transformation function (or collection of transformation functions) to apply
 *           to every tag that is extracted.
 */
module.exports = {
  name: 'tagExtractor',
  exports: {
    tagExtractor: ['factory', function tagExtractorFactory(tagDefinitions, defaultTransforms) {

      // Compute a default transformation function
      defaultTransformFn = getTransformationFn(defaultTransforms);

      // Add some useful methods to the tagDefs
      var tagDefs = _.map(tagDefinitions, function(tagDef) {

        // Make a copy of the tagDef as we are going to modify it
        tagDef = _.clone(tagDef);

        // Compute this tagDefs specific transformation function
        transformFn = getTransformationFn(tagDef.transforms || []);

        // Attach a transformation function to the cloned tagDef
        // running the specific transforms followed by the default transforms
        var tagProperty = tagDef.tagProperty || 'description';
        tagDef.getProperty = function(doc, tag) {
          var value = tag[tagProperty];
          value = transformFn(doc, tag, value);
          value = defaultTransformFn(doc, tag, value);
          return value;
        };

        return tagDef;
      });

      return function tagExtractor(doc) {

        // Try to extract each of the tags defined in the tagDefs collection
        _.forEach(tagDefs, function(tagDef) {

          log.silly('extracting tags for: ' + tagDef.name);

          var docProperty = tagDef.docProperty || tagDef.name;
          log.silly(' - to be attached to doc.' + docProperty);

          // Collect the tags for this tag def
          var tags = doc.tags.getTags(tagDef.name);

          // No tags found for this tag def
          if ( tags.length === 0 ) {

            // This tag is required so throw an error
            if ( tagDef.required ) {
              throw new Error('Missing tag "' + tagDef.name + '" in file "' + doc.file + '" at line ' + doc.startingLine);
            }

            // Apply the default function if there is one
            if ( tagDef.defaultFn ) {
              log.silly(' - tag not found, applying default value function');
              var defaultValue = tagDef.defaultFn(doc);
              if ( defaultValue !== undefined ) {
                // If the defaultFn returns a value then use this as the document property
                if ( tagDef.multi ) {
                  doc[docProperty] = (doc[docProperty] || []).concat(defaultValue);
                } else {
                  doc[docProperty] = defaultValue;
                }
              }
            }

          } else {

            // Does this tagDef expect multiple instances of the tag?
            if ( tagDef.multi ) {

              // We may have multiple tags for this tag def, so we put them into an array
              doc[docProperty] = doc[docProperty] || [];
              _.forEach(tags, function(tag) {
                // Transform and add the tag to the array
                doc[docProperty].push(tagDef.getProperty(doc, tag));
              });

            } else {

              // We only expect one tag for this tag def
              if ( tags.length > 1 ) {
                throw new Error('Only one of "' + tagDef.name + '" (or its aliases) allowed. There were ' + tags.length + ' in file "' + doc.file + '" at line ' + doc.startingLine);
              }

              // Transform and apply the tag to the document
              doc[docProperty] = tagDef.getProperty(doc, tags[0]);
            }
          }

          if ( doc.tags.badTags.length > 0 ) {
            log.warn(formatBadTagErrorMessage(doc));
          }
        });
      };
    }]
  }
};


/**
 * Create a function to transform from the tag to doc property
 * @param  {function(doc, tag, value)|Array.<function(doc, tag, value)>} transform
 *         The transformation to apply to the tag
 * @return {function(doc, tag, value)} A single function that will do the transformation
 */
function getTransformationFn(transforms) {

  if ( _.isFunction(transforms) ) {

    // transform is a single function so just use that
    return transforms;
  }

  if ( _.isArray(transforms) ) {

    // transform is an array then we will apply each in turn like a pipe-line
    return function(doc, tag, value) {

      _.forEach(transforms, function(transform) {
        value = transform(doc, tag, value);
      });

      return value;

    };
  }

  if ( !transforms ) {

    // No transform is specified so we just provide a default
    return function(doc, tag, value) { return value; };

  }

  throw new Error('Invalid transformFn in tag definition, ' + tagDef.name +
      ' - you must provide a function or an array of functions.');
}

function formatBadTagErrorMessage(doc) {
  var id = (doc.id || doc.name);
  id = id ? '"' + id + '" ' : '';
  var message = 'Invalid tags found in doc, starting at line ' + doc.startingLine + ', from file "' + doc.file + '"\n';

  _.forEach(doc.tags.badTags, function(badTag) {
    //console.log(badTag);
    var description = (_.isString(badTag.description) && (badTag.description.substr(0, 20) + '...'));
    if ( badTag.name ) {
      description = badTag.name + ' ' + description;
    }
    if ( badTag.typeExpression ) {
      description = '{' + badTag.typeExpression + '} ' + description;
    }

    message += 'Line: ' + badTag.startingLine + ': @' + badTag.tagName + ' ' + description + '\n';
    _.forEach(badTag.errors, function(error) {
      message += '    * ' + error + '\n';
    });
  });

  return message + '\n';
}
